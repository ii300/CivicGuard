"""Versioned, additive schema upgrades for SQLite and PostgreSQL."""

import secrets

import click
from sqlalchemy import inspect, text

from extensions import db
from models import AccountToken, LoginSession, RateBucket, SchemaVersion, utcnow

SCHEMA_REVISION = 2


def upgrade():
    # Deployment invokes this once before starting workers, never per request.
    # New tables are created; existing data is retained during additive upgrades.
    with db.engine.begin() as connection:
        existing = []
        if inspect(connection).has_table("schema_version"):
            existing = connection.execute(db.select(SchemaVersion.revision)).scalars().all()
        if existing and max(existing) > SCHEMA_REVISION:
            raise RuntimeError("This database was upgraded by a newer application. Deploy the matching code.")
        db.metadata.create_all(bind=connection)
        inspector = inspect(connection)
        alert_columns = {column["name"] for column in inspector.get_columns("alert_record")}
        if "user_id" not in alert_columns:
            connection.execute(text("ALTER TABLE alert_record ADD COLUMN user_id INTEGER REFERENCES users(id)"))
            connection.execute(text("CREATE INDEX ix_alert_record_user_id ON alert_record (user_id)"))
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "email_verified" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE"))
        if "auth_version" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN auth_version VARCHAR(64)"))
            for user_id in connection.execute(text("SELECT id FROM users")).scalars().all():
                connection.execute(text("UPDATE users SET auth_version = :version WHERE id = :id"),
                                   {"version": secrets.token_hex(32), "id": user_id})
        draft_columns = {column["name"] for column in inspector.get_columns("saved_draft")}
        if "version" not in draft_columns:
            connection.execute(text("ALTER TABLE saved_draft ADD COLUMN version INTEGER NOT NULL DEFAULT 1"))
        for revision in range(1, SCHEMA_REVISION + 1):
            if revision not in existing:
                connection.execute(db.insert(SchemaVersion).values(revision=revision))


def init_database_commands(app):
    @app.cli.group("db")
    def database_commands():
        """Upgrade or maintain the application database."""

    @database_commands.command("upgrade")
    def upgrade_command():
        upgrade()
        click.echo(f"Database ready at schema revision {SCHEMA_REVISION}.")

    @database_commands.command("prune")
    def prune_command():
        """Remove expired sessions, account tokens and rate-limit windows."""
        import time
        db.session.execute(db.delete(LoginSession).where(LoginSession.expires_at < utcnow()))
        db.session.execute(db.delete(AccountToken).where(AccountToken.expires_at < utcnow()))
        db.session.execute(db.delete(RateBucket).where(RateBucket.expires_at < int(time.time())))
        db.session.commit()
        click.echo("Expired security records removed.")
