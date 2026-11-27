from datetime import date

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RentalAgreement(Base):
    __tablename__ = "rental_agreements"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # El landlord crea el acuerdo y queda registrado como creador.
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    # La propiedad sobre la cual se crea el acuerdo.
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), nullable=False, index=True)

    # Referencias a blockchain y almacenamiento descentralizado.
    rent_contract_address: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    escrow_contract_address: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    ipfs_document_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Fechas principales del alquiler.
    start_date: Mapped[date] = mapped_column(nullable=False)
    end_date: Mapped[date] = mapped_column(nullable=False)

    # Estado del acuerdo alineado a la v1 del producto.
    # Valores esperados:
    # - draft
    # - active
    # - cancelled
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")

    # Aceptaciones necesarias antes de activar el acuerdo.
    tenant_accepted: Mapped[bool] = mapped_column(default=False, nullable=False)
    arbiter_accepted: Mapped[bool] = mapped_column(default=False, nullable=False)
