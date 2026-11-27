from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse
from app.services.user_service import get_all_users, register_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    # La ruta pide la lista al service y devuelve el resultado serializado por Pydantic.
    return get_all_users(db)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    # El registro valida reglas de negocio en el service y persiste via repository.
    return register_user(db, payload)

