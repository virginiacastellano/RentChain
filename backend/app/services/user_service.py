from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException
from app.core.security import get_password_hash
from app.models.user import User
from app.repositories.user_repository import (
    create_user,
    get_user_by_email,
    get_user_by_wallet_address,
    list_users,
)
from app.schemas.user import UserCreate


def get_all_users(db: Session) -> list[User]:
    return list_users(db)


def register_user(db: Session, payload: UserCreate) -> User:
    # El service de usuario aplica reglas de negocio antes de tocar la DB.
    existing_user = get_user_by_email(db, payload.email)

    if existing_user:
        raise BadRequestException(
            detail="Email already registered",
            error_code="email_already_registered",
        )

    if payload.wallet_address:
        existing_wallet_user = get_user_by_wallet_address(db, payload.wallet_address)

        if existing_wallet_user:
            raise BadRequestException(
                detail="Wallet address already registered",
                error_code="wallet_already_registered",
            )

    hashed_password = get_password_hash(payload.password)

    # Si pasa todas las validaciones, delega la persistencia al repository.
    return create_user(
        db,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hashed_password,
        wallet_address=payload.wallet_address,
    )
