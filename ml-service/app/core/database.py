"""Optional SQLAlchemy session factory for direct DB reads.

The ML service prefers HTTP via the backend gateway (ai-service pattern), but
some training jobs benefit from raw SQL. This module is opt-in: callers that
don't need DB access never import it.
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None
_engines_by_url: dict[str, Engine] = {}
_sessions_by_url: dict[str, sessionmaker[Session]] = {}


def _ensure_engine() -> sessionmaker[Session]:
    global _engine, _SessionLocal
    if _SessionLocal is None:
        settings = get_settings()
        _engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
        _SessionLocal = sessionmaker(
            bind=_engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            future=True,
        )
    return _SessionLocal


def _ensure_engine_for_url(database_url: str) -> sessionmaker[Session]:
    if database_url not in _sessions_by_url:
        engine = create_engine(database_url, pool_pre_ping=True, future=True)
        _engines_by_url[database_url] = engine
        _sessions_by_url[database_url] = sessionmaker(
            bind=engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            future=True,
        )
    return _sessions_by_url[database_url]


@contextmanager
def get_session() -> Iterator[Session]:
    factory = _ensure_engine()
    session = factory()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def get_session_for_url(database_url: str) -> Iterator[Session]:
    factory = _ensure_engine_for_url(database_url)
    session = factory()
    try:
        yield session
    finally:
        session.close()
