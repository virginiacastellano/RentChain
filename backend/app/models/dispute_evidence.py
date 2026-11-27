from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DisputeEvidence(Base):
    __tablename__ = "dispute_evidences"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Disputa a la cual pertenece esta evidencia.
    dispute_id: Mapped[int] = mapped_column(
        ForeignKey("disputes.id"),
        nullable=False,
        index=True,
    )

    # Usuario que subio la evidencia.
    uploaded_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # Tipo de evidencia:
    # - image
    # - document
    # - text
    # - ipfs_file
    evidence_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Texto descriptivo o comentario asociado.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Referencia externa o hash IPFS del archivo.
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ipfs_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
