from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=6, max_length=72)
    wallet_address: str | None = Field(default=None, min_length=6, max_length=255)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("full_name")
    @classmethod
    def normalize_full_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("wallet_address")
    @classmethod
    def normalize_wallet_address(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    wallet_address: str | None
    is_active: bool
    is_admin: bool

    model_config = ConfigDict(from_attributes=True)
