from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

MIN_RECHARGE_YUAN = Decimal("1.00")
MAX_RECHARGE_YUAN = Decimal("500.00")


def yuan_to_cents(amount: str) -> int:
    try:
        yuan = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        raise ValueError("Invalid amount")
    if yuan < MIN_RECHARGE_YUAN or yuan > MAX_RECHARGE_YUAN:
        raise ValueError("Amount must be between ¥1.00 and ¥500.00")
    return int(yuan * 100)


def cents_to_yuan(cents: int) -> str:
    return f"{Decimal(cents) / Decimal(100):.2f}"
