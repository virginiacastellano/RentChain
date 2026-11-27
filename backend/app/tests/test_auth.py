from fastapi.testclient import TestClient
from types import SimpleNamespace

from app.main import app
from app.api.deps import get_current_user, get_db
from app.api.routes import auth as auth_routes
from app.core.exceptions import UnauthorizedException

client = TestClient(app)


def test_login_returns_401_for_invalid_credentials() -> None:
    # Simulamos la base y el service para que el test no dependa de PostgreSQL.
    def override_get_db():
        yield object()

    def fake_login_user(db: object, email: str, password: str) -> str:
        raise UnauthorizedException()

    app.dependency_overrides[get_db] = override_get_db
    original_login_user = auth_routes.login_user
    auth_routes.login_user = fake_login_user

    try:
        response = client.post(
            "/auth/login",
            data={
                "username": "noexiste@example.com",
                "password": "incorrecta",
            },
        )
    finally:
        auth_routes.login_user = original_login_user
        app.dependency_overrides.clear()

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Invalid credentials",
        "error_code": "invalid_credentials",
    }


def test_auth_me_returns_401_when_token_is_missing() -> None:
    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_auth_me_returns_current_user_when_authenticated() -> None:
    fake_user = SimpleNamespace(
        id=99,
        email="test@example.com",
        full_name="Test User",
        wallet_address="0xtest123",
        is_active=True,
        is_admin=False,
    )

    app.dependency_overrides[get_current_user] = lambda: fake_user

    try:
        response = client.get("/auth/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "id": 99,
        "email": "test@example.com",
        "full_name": "Test User",
        "wallet_address": "0xtest123",
        "is_active": True,
        "is_admin": False,
    }


def test_forgot_password_does_not_expose_reset_token() -> None:
    def override_get_db():
        yield object()

    def fake_request_password_reset(db: object, email: str) -> str:
        assert email == "user@example.com"
        return "reset-token-123"

    app.dependency_overrides[get_db] = override_get_db
    original_request_password_reset = auth_routes.request_password_reset
    auth_routes.request_password_reset = fake_request_password_reset

    try:
        response = client.post(
            "/auth/forgot-password",
            json={"email": "user@example.com"},
        )
    finally:
        auth_routes.request_password_reset = original_request_password_reset
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"message": auth_routes.FORGOT_PASSWORD_MESSAGE}
    assert "reset-token-123" not in response.text


def test_forgot_password_same_response_for_unknown_email() -> None:
    def override_get_db():
        yield object()

    app.dependency_overrides[get_db] = override_get_db
    original_request_password_reset = auth_routes.request_password_reset
    auth_routes.request_password_reset = lambda db, email: None

    try:
        response = client.post(
            "/auth/forgot-password",
            json={"email": "nobody@example.com"},
        )
    finally:
        auth_routes.request_password_reset = original_request_password_reset
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"message": auth_routes.FORGOT_PASSWORD_MESSAGE}


def test_reset_password_returns_success_message() -> None:
    def override_get_db():
        yield object()

    captured: dict[str, str] = {}

    def fake_reset_password(db: object, token: str, new_password: str) -> None:
        captured["token"] = token
        captured["new_password"] = new_password

    app.dependency_overrides[get_db] = override_get_db
    original_reset_password = auth_routes.reset_password
    auth_routes.reset_password = fake_reset_password

    try:
        response = client.post(
            "/auth/reset-password",
            json={
                "token": "reset-token-123",
                "new_password": "newsecurepassword",
            },
        )
    finally:
        auth_routes.reset_password = original_reset_password
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"message": "Password updated successfully"}
    assert captured == {
        "token": "reset-token-123",
        "new_password": "newsecurepassword",
    }
