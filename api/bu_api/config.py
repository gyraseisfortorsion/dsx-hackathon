from pathlib import Path
from typing import Literal

from pydantic import AwareDatetime, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=API_ROOT / ".env", extra="ignore")

    api_password: SecretStr = SecretStr("")
    llm_model: str = "google:gemini-3.8-flash"
    google_api_key: SecretStr | None = None
    history_dir: Path = API_ROOT / "runtime" / "messages"
    history_backend: Literal["file", "blob"] = "file"
    blob_store_id: str = ""
    blob_read_write_token: SecretStr | None = None
    data_dir: Path = API_ROOT / "data"
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    chat_timeout_seconds: float = Field(default=60, gt=0)
    bu_public_api_key: SecretStr | None = None
    bu_public_api_base_url: str = "https://public.api-nonprod.bu.edu/api/v1"
    bu_public_api_expires_at: AwareDatetime | None = None
    bu_public_api_timeout_seconds: float = Field(default=8, gt=0, le=30)

    community_ml_review_enabled: bool = False
    community_verified_users: str = "alex,maya,jordan,sam,taylor"
    community_moderator_token: SecretStr = SecretStr("")
    study_min_overlap_minutes: int = Field(default=30, ge=1, le=1440)
    study_overlap_target_minutes: int = Field(default=180, ge=1)
    marketplace_expiry_days: int = Field(default=30, ge=1, le=365)
    community_invitations_per_hour: int = Field(default=20, ge=1)
    community_listings_per_hour: int = Field(default=10, ge=1)
    community_messages_per_hour: int = Field(default=120, ge=1)

    def history_path(self) -> Path:
        return self.history_dir if self.history_dir.is_absolute() else API_ROOT / self.history_dir
