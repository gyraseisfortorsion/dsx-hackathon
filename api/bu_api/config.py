from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
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

    def history_path(self) -> Path:
        return self.history_dir if self.history_dir.is_absolute() else API_ROOT / self.history_dir
