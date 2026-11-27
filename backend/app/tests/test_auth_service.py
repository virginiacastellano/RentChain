import pytest
from types import SimpleNamespace

from app.core.exceptions import BadRequestException, NotFoundException
from app.services import auth_service


def test_request_password_reset_raises_not_found_when_user_does_not_exist(monkeypatch) -> None:
    # Simulamos que el repository no encuentra ningun usuario para ese email.
    def fake_get_user_by_email(db, email: str):
        return None

    # Reemplazamos temporalmente la funcion real por la falsa.
    monkeypatch.setattr(auth_service, "get_user_by_email", fake_get_user_by_email)

    # Verificamos que el service lance la excepcion correcta.
    with pytest.raises(NotFoundException) as exc_info:
        auth_service.request_password_reset(db=object(), email="missing@example.com")

    # Comprobamos que el mensaje y el codigo de error sean los esperados.
    assert exc_info.value.detail == "User not found"
    assert exc_info.value.error_code == "user_not_found"


def test_reset_password_raises_bad_request_when_token_is_invalid(monkeypatch) -> None:
    # Simulamos que el token no se puede validar o ya expiro.
    def fake_verify_password_reset_token(token: str):
        return None

    # Reemplazamos temporalmente la verificacion real del token.
    monkeypatch.setattr(auth_service, "verify_password_reset_token", fake_verify_password_reset_token)

    # Verificamos que el service responda con el error correcto.
    with pytest.raises(BadRequestException) as exc_info:
        auth_service.reset_password(
            db=object(),
            token="invalid-token",
            new_password="newpassword123",
        )

    # Comprobamos el detalle del error de negocio.
    assert exc_info.value.detail == "Invalid or expired reset token"
    assert exc_info.value.error_code == "invalid_reset_token"


def test_reset_password_raises_bad_request_when_new_password_matches_current_password(monkeypatch) -> None:
    # Creamos un usuario falso, suficiente para este test.
    fake_user = SimpleNamespace(
        email="user@example.com",
        hashed_password="hashed-password",
    )

    # Simulamos que el token es valido y pertenece a ese email.
    def fake_verify_password_reset_token(token: str):
        return "user@example.com"

    # Simulamos que el repository encuentra al usuario.
    def fake_get_user_by_email(db, email: str):
        return fake_user

    # Simulamos que la nueva password coincide con la actual.
    def fake_verify_password(plain_password: str, hashed_password: str) -> bool:
        return True

    # Aplicamos los reemplazos temporales de dependencias.
    monkeypatch.setattr(auth_service, "verify_password_reset_token", fake_verify_password_reset_token)
    monkeypatch.setattr(auth_service, "get_user_by_email", fake_get_user_by_email)
    monkeypatch.setattr(auth_service, "verify_password", fake_verify_password)

    # Esperamos que el service rechace la nueva password.
    with pytest.raises(BadRequestException) as exc_info:
        auth_service.reset_password(
            db=object(),
            token="valid-token",
            new_password="same-password",
        )

    # Validamos que el error sea el correcto.
    assert exc_info.value.detail == "New password must be different from the current password"
    assert exc_info.value.error_code == "password_not_changed"
