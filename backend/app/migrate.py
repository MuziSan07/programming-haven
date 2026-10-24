"""Minimal schema upkeep: create tables and add columns that newer models define.

Good enough for the demo phase; switch to Alembic migrations before production.
"""

import logging

from sqlalchemy import inspect, text

from .database import Base, engine

log = logging.getLogger("haven.migrate")


def _default_sql(column) -> str:
    default = column.default.arg if column.default is not None and not callable(column.default.arg) else None
    if default is None:
        return ""
    if isinstance(default, bool):
        return f" DEFAULT {'TRUE' if default else 'FALSE'}" if engine.dialect.name != "sqlite" else f" DEFAULT {int(default)}"
    if isinstance(default, (int, float)):
        return f" DEFAULT {default}"
    return " DEFAULT '{}'".format(str(default).replace("'", "''"))


def upgrade() -> None:
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                col_type = column.type.compile(dialect=engine.dialect)
                conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN "{column.name}" {col_type}{_default_sql(column)}'))
                log.info("Added column %s.%s", table.name, column.name)
