from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)


def get_password_hash(password: str) -> str:
    # Nunca guardamos la password plana: solo su hash.
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Compara una password plana contra su hash guardado.
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str) -> str:
    # Este token representa una sesion autenticada normal.
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)

    to_encode = {
        "sub": subject,
        "exp": expire,
    }

    return jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def create_password_reset_token(subject: str) -> str:
    # Este token se usa solo para recuperar contrasena y tiene un tipo distinto.
    expire = datetime.now(UTC) + timedelta(minutes=30)

    to_encode = {
        "sub": subject,
        "exp": expire,
        "type": "password_reset",
    }

    return jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def verify_password_reset_token(token: str) -> str | None:
    # Devuelve el email si el token es valido y pertenece al flujo de reset.
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )

        token_type = payload.get("type")
        email = payload.get("sub")

        if token_type != "password_reset" or email is None:
            return None

        return email
    except JWTError:
        return None
