# pyright: reportImplicitRelativeImport=false, reportMissingImports=false
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from sqlalchemy import update

from billing import PLANS
from models import Order, OrderStatus, User, adjust_balance, balance_column


def amount_to_cents(amount_yuan: str) -> int:
    try:
        cents = (Decimal(str(amount_yuan)) * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        raise ValueError("Invalid amount")
    return int(cents)


def public_plans() -> list[dict[str, str | int]]:
    return [
        {
            "id": plan_id,
            "name": plan["name"],
            "amount_yuan": plan["amount_yuan"],
            "amount_usd": plan["amount_usd"],
            "minutes": plan["minutes"],
        }
        for plan in PLANS
        for plan_id in [str(plan["id"])]
    ]


def credit_order(db: Any, order: Order) -> None:
    if order.status not in (OrderStatus.CREATED, OrderStatus.CANCELED):
        return
    order.status = OrderStatus.CREDITED
    user = db.query(User).filter(User.id == order.user_id).with_for_update().first()
    if user:
        adjust_balance(user, order.credit_scope, order.credit_cents or order.amount_cents)


def revoke_order_credit(db: Any, order: Order) -> bool:
    revoked = db.execute(
        update(Order)
        .where(
            Order.id == order.id,
            Order.status.in_((OrderStatus.CREDITED, OrderStatus.PAID)),
        )
        .values(status=OrderStatus.REFUNDED)
    )
    if revoked.rowcount != 1:
        return False
    column = balance_column(order.credit_scope)
    db.execute(
        update(User)
        .where(User.id == order.user_id)
        .values({column: column - (order.credit_cents or order.amount_cents)})
    )
    return True
