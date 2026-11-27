from app.core.security import get_password_hash, verify_password


def test_get_password_hash_returns_different_value_than_plain_password() -> None:
    plain_password = "123456"

    hashed_password = get_password_hash(plain_password)

    assert hashed_password != plain_password

def test_verify_password_returns_true_for_correct_password() -> None:
    plain_password = "123456"
    hashed_password = get_password_hash(plain_password)

    is_valid = verify_password(plain_password, hashed_password)

    assert is_valid is True
    
def test_verify_password_returns_false_for_incorrect_password() -> None:
    plain_password = "123456"
    wrong_password = "abcdef"
    hashed_password = get_password_hash(plain_password)

    is_valid = verify_password(wrong_password, hashed_password)

    assert is_valid is False
