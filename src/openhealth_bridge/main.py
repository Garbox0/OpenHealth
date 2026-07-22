from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from openhealth_bridge.api import router as api_router
from openhealth_bridge.config import get_frontend_origins, get_settings
from openhealth_bridge.db import close_engine, is_database_ready
from openhealth_bridge.security_api import router as security_router


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=()",
        )
        response.headers.setdefault("Cache-Control", "no-store")
        return response


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await close_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    docs_url = "/docs" if settings.enable_api_docs else None
    redoc_url = "/redoc" if settings.enable_api_docs else None
    openapi_url = "/openapi.json" if settings.enable_api_docs else None
    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_frontend_origins(settings),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-OpenHealth-Tenant"],
    )

    @app.get("/", tags=["root"])
    async def root() -> dict[str, str]:
        payload = {
            "name": settings.app_name,
            "status": "ok",
        }
        if settings.enable_api_docs:
            payload["docs"] = "/docs"
        return payload

    @app.get("/health/live", tags=["health"])
    async def live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready", tags=["health"])
    async def ready() -> JSONResponse:
        if not await is_database_ready():
            return JSONResponse(
                status_code=503,
                content={
                    "status": "error",
                    "checks": {"database": "unavailable"},
                },
            )

        return JSONResponse(
            content={
                "status": "ok",
                "checks": {"database": "ok"},
            }
        )

    app.include_router(api_router)
    app.include_router(security_router)

    return app


app = create_app()
