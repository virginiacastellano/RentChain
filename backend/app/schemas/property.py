from pydantic import BaseModel, ConfigDict, Field, field_validator


class PropertyCreate(BaseModel):
    # Este id lo manda la app cuando el landlord crea la propiedad.
    landlord_id: int

    title: str = Field(min_length=3, max_length=255)
    address_line: str = Field(min_length=5, max_length=255)
    city: str = Field(min_length=2, max_length=100)
    province: str = Field(min_length=2, max_length=100)
    country: str = Field(default="Argentina", min_length=2, max_length=100)

    description: str | None = None
    photo_ipfs_hash: str | None = None

    @field_validator("title", "address_line", "city", "province", "country")
    @classmethod
    def strip_basic_fields(cls, value: str) -> str:
        return value.strip()


class PropertyResponse(BaseModel):
    id: int
    landlord_id: int
    title: str
    address_line: str
    city: str
    province: str
    country: str
    description: str | None
    photo_ipfs_hash: str | None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
