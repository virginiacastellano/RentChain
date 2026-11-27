from pydantic import BaseModel, ConfigDict, Field, field_validator


class DisputeCreate(BaseModel):
    rental_agreement_id: int
    opened_by_user_id: int

    reason: str = Field(min_length=3, max_length=255)
    description: str | None = None

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        return value.strip()


class DisputeResponse(BaseModel):
    id: int
    rental_agreement_id: int
    opened_by_user_id: int
    reason: str
    description: str | None
    status: str
    resolution_notes: str | None

    model_config = ConfigDict(from_attributes=True)
