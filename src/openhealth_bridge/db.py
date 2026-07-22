from collections.abc import AsyncIterator
from typing import Final

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from openhealth_bridge.config import Settings, get_settings

PING_QUERY: Final = text("SELECT 1")

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine(settings: Settings | None = None) -> AsyncEngine:
    global _engine

    if _engine is None:
        current_settings = settings or get_settings()
        _engine = create_async_engine(
            current_settings.database_url,
            echo=current_settings.database_echo,
            pool_pre_ping=True,
        )

    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory

    if _session_factory is None:
        _session_factory = create_session_factory(get_engine())

    return _session_factory


def create_session_factory(
    engine: AsyncEngine,
) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        engine,
        expire_on_commit=False,
    )


async def get_db_session() -> AsyncIterator[AsyncSession]:
    session_factory = get_session_factory()

    async with session_factory() as session:
        yield session


async def is_database_ready() -> bool:
    try:
        async with get_engine().connect() as connection:
            await connection.execute(PING_QUERY)
    except (OSError, SQLAlchemyError, TimeoutError):
        return False

    return True


async def close_engine() -> None:
    global _engine, _session_factory

    if _engine is not None:
        await _engine.dispose()

    _engine = None
    _session_factory = None
