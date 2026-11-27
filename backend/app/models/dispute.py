from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Dispute(Base):
    __tablename__ = "disputes"

    __table_args__ = (
        # En esta v1 vamos a permitir una sola disputa activa por acuerdo.
        UniqueConstraint(
            "rental_agreement_id",
            name="uq_dispute_rental_agreement_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Acuerdo sobre el cual se abre la disputa.
    rental_agreement_id: Mapped[int] = mapped_column(
        ForeignKey("rental_agreements.id"),
        nullable=False,
        index=True,
    )

    # Usuario que abre la disputa.
    opened_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # Motivo o descripcion inicial del conflicto.
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Estado de la disputa.
    # Valores esperados:
    # - open
    # - resolved_for_landlord
    # - resolved_for_tenant
    # - closed
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="open")

    # Decision final del arbitro, cuando exista.
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
