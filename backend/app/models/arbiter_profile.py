from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ArbiterProfile(Base):
    __tablename__ = "arbiter_profiles"

    __table_args__ = (
        # Un usuario solo debe tener un perfil de arbitro.
        UniqueConstraint("user_id", name="uq_arbiter_profile_user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Usuario al que pertenece este perfil de arbitro.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # Datos internos de verificacion profesional.
    license_number: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    jurisdiction: Mapped[str] = mapped_column(String(100), nullable=False, default="Argentina")
    verification_status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")

    # Permite distinguir si el arbitro puede ser asignado a acuerdos.
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    # En esta v1 la identidad del arbitro se valida internamente,
    # pero puede quedar reservada frente a landlord y tenant en disputa.
    is_identity_hidden: Mapped[bool] = mapped_column(default=True, nullable=False)
