from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


def get_user_by_email(db: Session, email: str) -> User | None:
    # El repository encapsula la consulta SQLAlchemy para no mezclar DB con negocio.
    return db.execute(
        select(User).where(User.email == email)
    ).scalar_one_or_none()


def get_user_by_wallet_address(db: Session, wallet_address: str) -> User | None:
    return db.execute(
        select(User).where(User.wallet_address == wallet_address)
    ).scalar_one_or_none()


def list_users(db: Session) -> list[User]:
    return db.execute(select(User)).scalars().all()


def create_user(
    db: Session,
    *,
    email: str,
    full_name: str,
    hashed_password: str,
    wallet_address: str | None,
) -> User:
    # Aca se materializa la escritura real en la base de datos.
    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hashed_password,
        wallet_address=wallet_address,
        is_active=True,
        is_admin=False,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user

def update_user_password(db: Session, user: User, hashed_password: str) -> User:
    # Actualiza solo el hash ya calculado por el service de autenticacion.
    user.hashed_password = hashed_password
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
