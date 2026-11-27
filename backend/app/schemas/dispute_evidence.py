from pydantic import BaseModel, ConfigDict, Field, model_validator


class DisputeEvidenceCreate(BaseModel):
    dispute_id: int
    uploaded_by_user_id: int

    evidence_type: str = Field(min_length=3, max_length=50)
    description: str | None = None
    file_url: str | None = None
    ipfs_hash: str | None = None

    @model_validator(mode="after")
    def validate_file_reference(self):
        # En esta v1 pedimos que exista al menos una referencia:
        # o una URL o un hash IPFS o una descripcion de texto.
        if not self.file_url and not self.ipfs_hash and not self.description:
            raise ValueError(
                "At least one of file_url, ipfs_hash or description must be provided"
            )
        return self


class DisputeEvidenceResponse(BaseModel):
    id: int
    dispute_id: int
    uploaded_by_user_id: int
    evidence_type: str
    description: str | None
    file_url: str | None
    ipfs_hash: str | None

    model_config = ConfigDict(from_attributes=True)
