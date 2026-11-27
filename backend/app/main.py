from fastapi import FastAPI

from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.users import router as users_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.base import Base
from app.db.session import engine
from app.models import AgreementParticipant, ArbiterProfile, Dispute, DisputeEvidence, Property, RentalAgreement, User  # noqa: F401
from app.core.error_handlers import register_exception_handlers


setup_logging()

# `app` es el punto de entrada de FastAPI: desde aca se registran routers,
# handlers globales y eventos de inicio de la aplicacion.
app = FastAPI(
    title=settings.app_name,
    debug=settings.app_debug,
)

register_exception_handlers(app)


@app.on_event("startup")
def on_startup() -> None:
    # Crea las tablas conocidas al iniciar la app. Mas adelante esto deberia
    # migrarse a Alembic, pero para esta etapa nos sirve para aprender.
    Base.metadata.create_all(bind=engine)


app.include_router(health_router)
app.include_router(users_router)
app.include_router(auth_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "RentChain API running"}
