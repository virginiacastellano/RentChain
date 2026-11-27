from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

import structlog

from app.api.deps import get_current_user, get_db
from app.core.config import settings
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
logger = structlog.get_logger()

FORGOT_PASSWORD_MESSAGE = "If the email is registered, a reset link will be sent"


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
    # El token nunca viaja en la respuesta: quien pide el reset no tiene por que
    # ser el duenio del email. En produccion se envia por email; mientras no hay
    # servicio de email, en development se escribe en el log del servidor.
    reset_token = request_password_reset(db, payload.email)

    if reset_token and settings.app_env == "development":
        logger.info("password_reset_token_generated", email=payload.email, reset_token=reset_token)

    return ForgotPasswordResponse(message=FORGOT_PASSWORD_MESSAGE)


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
