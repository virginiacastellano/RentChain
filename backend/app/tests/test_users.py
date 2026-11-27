from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_db
from app.api.routes import users as users_routes
from app.main import app

client = TestClient(app)


def _fake_user(is_admin: bool) -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        email="admin@example.com" if is_admin else "user@example.com",
        full_name="Test User",
        wallet_address="0xabc",
        is_active=True,
        is_admin=is_admin,
    )


def test_list_users_requires_authentication() -> None:
    response = client.get("/users")

    assert response.status_code == 401


def test_list_users_forbidden_for_non_admin() -> None:
    app.dependency_overrides[get_current_user] = lambda: _fake_user(is_admin=False)

    try:
        response = client.get("/users")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin privileges required"


def test_list_users_allowed_for_admin() -> None:
    admin = _fake_user(is_admin=True)

    def override_get_db():
        yield object()

    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_db] = override_get_db
    original_get_all_users = users_routes.get_all_users
    users_routes.get_all_users = lambda db: [admin]

    try:
        response = client.get("/users")
    finally:
        users_routes.get_all_users = original_get_all_users
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()[0]["email"] == "admin@example.com"
