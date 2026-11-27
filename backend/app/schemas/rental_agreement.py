from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class RentalAgreementCreate(BaseModel):
    # Usuario que inicia el acuerdo: en esta v1 será el landlord.
    created_by_id: int

    property_id: int
    ipfs_document_hash: str = Field(min_length=5, max_length=255)

    start_date: date
    end_date: date

    rent_contract_address: str | None = None
    escrow_contract_address: str | None = None

    @field_validator("ipfs_document_hash")
    @classmethod
    def strip_document_hash(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be greater than start_date")
        return self


class RentalAgreementResponse(BaseModel):
    id: int
    created_by_id: int
    property_id: int
    rent_contract_address: str | None
    escrow_contract_address: str | None
    ipfs_document_hash: str
    start_date: date
    end_date: date
    status: str
    tenant_accepted: bool
    arbiter_accepted: bool

    model_config = ConfigDict(from_attributes=True)
