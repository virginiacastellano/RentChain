from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Usuario propietario de esta propiedad dentro de la plataforma.
    landlord_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    # Datos basicos del inmueble.
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    address_line: Mapped[str] = mapped_column(String(255), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    province: Mapped[str] = mapped_column(String(100), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="Argentina")

    # Texto libre para describir la propiedad.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Hash o referencia IPFS para fotos o metadata visual.
    photo_ipfs_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Estado simple para saber si la propiedad sigue disponible.
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
