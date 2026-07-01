import pytest

from money import cents_to_yuan, yuan_to_cents


def test_money_parsing_is_decimal_safe():
    assert yuan_to_cents("9.90") == 990
    assert yuan_to_cents("9.999") == 1000
    assert cents_to_yuan(990) == "9.90"


@pytest.mark.parametrize("amount", ["0", "0.99", "501", "abc", ""])
def test_money_rejects_invalid_amounts(amount):
    with pytest.raises(ValueError):
        yuan_to_cents(amount)
