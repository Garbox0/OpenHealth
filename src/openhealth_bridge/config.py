from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "OpenHealth Bridge"
    environment: str = "local"
    database_url: str = "sqlite+aiosqlite:///./openhealth_bridge_local.db"
    database_echo: bool = False
    frontend_origins: str = "https://www.aerosftp.com,https://centralsalud.aerosftp.com"
    require_auth: bool = True
    enable_api_docs: bool = True
    oidc_issuer_url: str = "http://127.0.0.1:8081/realms/openhealth"
    oidc_jwks_url: str | None = None
    oidc_client_id: str = "openhealth-dev"
    keycloak_admin_base_url: str = "http://127.0.0.1:8081"
    keycloak_admin_realm: str = "openhealth"
    keycloak_admin_client_id: str = "admin-cli"
    keycloak_admin_username: str = "admin"
    keycloak_admin_password: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="OPENHEALTH_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_frontend_origins(settings: Settings) -> list[str]:
    return [origin.strip() for origin in settings.frontend_origins.split(",") if origin.strip()]
