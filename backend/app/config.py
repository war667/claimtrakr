from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://ct:changeme@db:5432/claimtrakr"
    BASIC_AUTH_USER: str = "admin"
    BASIC_AUTH_PASS: str = "changeme"
    APP_ENV: str = "production"
    LOG_LEVEL: str = "INFO"
    UPLOADS_PATH: str = "/uploads"
    BLM_CLAIMS_BASE_URL: str = (
        "https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_MLRS_Mining_Claims/MapServer"
    )
    BLM_CLAIMS_ACTIVE_LAYER: int = 0
    BLM_CLAIMS_CLOSED_LAYER: int = 1
    POSTGRES_USER: str = "ct"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
