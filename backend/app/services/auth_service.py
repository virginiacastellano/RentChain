from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, NotFoundException, UnauthorizedException
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    get_password_hash,
    verify_password,
    verify_password_reset_token,
)
from app.repositories.user_repository import get_user_by_email, update_user_password


def login_user(db: Session, email: str, password: str) -> str:
    # El service concentra la regla de negocio del login:
    # buscar usuario, validar password y emitir JWT.
    user = get_user_by_email(db, email)

    if not user:
        raise UnauthorizedException()

    if not verify_password(password, user.hashed_password):
        raise UnauthorizedException()

    return create_access_token(subject=user.email)


def request_password_reset(db: Session, email: str) -> str:
    # El service genera un token de recuperacion solo si el usuario existe.
    user = get_user_by_email(db, email)

    if not user:
        raise NotFoundException(
            detail="User not found",
            error_code="user_not_found",
        )

    return create_password_reset_token(subject=user.email)


def reset_password(db: Session, token: str, new_password: str) -> None:
    # El cambio de password valida el token, busca al usuario y evita
    # reutilizar la misma contrasena antes de guardar el nuevo hash.
    email = verify_password_reset_token(token)

    if not email:
        raise BadRequestException(
            detail="Invalid or expired reset token",
            error_code="invalid_reset_token",
        )

    user = get_user_by_email(db, email)

    if not user:
        raise NotFoundException(
            detail="User not found",
            error_code="user_not_found",
        )

    if verify_password(new_password, user.hashed_password):
        raise BadRequestException(
            detail="New password must be different from the current password",
            error_code="password_not_changed",
        )

    hashed_password = get_password_hash(new_password)
    update_user_password(db, user, hashed_password)
