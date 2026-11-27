from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    TokenResponse,
)
from app.schemas.user import UserResponse
from app.services.auth_service import login_user, request_password_reset, reset_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=TokenResponse,
    responses={
        401: {
            "description": "Invalid credentials",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "Invalid credentials",
                        "error_code": "invalid_credentials",
                    }
                }
            },
        },
        422: {
            "description": "Request validation error",
        },
    },
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenResponse:
    # La ruta solo coordina HTTP. La logica real de autenticacion vive en el service.
    access_token = login_user(
        db,
        email=form_data.username,
        password=form_data.password,
    )

    return TokenResponse(access_token=access_token)


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    status_code=status.HTTP_200_OK,
)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
) -> ForgotPasswordResponse:
    # Por ahora devolvemos el token en la respuesta para poder aprender el flujo.
    # En una version real, esto deberia enviarse por email u otro canal seguro.
    reset_token = request_password_reset(db, payload.email)
    return ForgotPasswordResponse(
        message="Password reset token generated",
        reset_token=reset_token,
    )


@router.post(
    "/reset-password",
    status_code=status.HTTP_200_OK,
)
def reset_user_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    # Esta ruta delega al service la validacion del token y el cambio del hash.
    reset_password(db, payload.token, payload.new_password)
    return {"message": "Password updated successfully"}


@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user
