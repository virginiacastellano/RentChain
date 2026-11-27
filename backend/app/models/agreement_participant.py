from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AgreementParticipant(Base):
    __tablename__ = "agreement_participants"

    __table_args__ = (
        # Evita que el mismo usuario tenga dos veces el mismo rol
        # dentro del mismo acuerdo.
        UniqueConstraint(
            "rental_agreement_id",
            "role",
            name="uq_agreement_participant_agreement_role",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Acuerdo al que pertenece este participante.
    rental_agreement_id: Mapped[int] = mapped_column(
        ForeignKey("rental_agreements.id"),
        nullable=False,
        index=True,
    )

    # Usuario participante en el acuerdo.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # Rol dentro del acuerdo:
    # - landlord
    # - tenant
    # - arbiter
    role: Mapped[str] = mapped_column(String(50), nullable=False)

    # Aceptacion del participante en este acuerdo.
    has_accepted: Mapped[bool] = mapped_column(default=False, nullable=False)
