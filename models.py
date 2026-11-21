"""Accounts and private simulation drafts. No public alert delivery."""

from datetime import datetime, timezone
import secrets

from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(254), nullable=False, unique=True)
    password_hash = db.Column(db.String(512), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    email_verified = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    auth_version = db.Column(db.String(64), nullable=False, default=lambda: secrets.token_hex(32))

    @property
    def is_authenticated(self):
        return True

    def get_id(self):
        return str(self.id)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password, method="scrypt")

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class AlertRecord(db.Model):
    """Retain the original AI records; unowned legacy records stay private."""

    id = db.Column(db.Integer, primary_key=True)
    area = db.Column(db.String(100), nullable=False)
    content = db.Column(db.Text, nullable=False)
    severity = db.Column(db.String(20))
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)


class SavedDraft(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    title = db.Column(db.String(100), nullable=False)
    messages = db.Column(db.JSON, nullable=False)
    language = db.Column(db.String(2), nullable=False)
    channels = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    version = db.Column(db.Integer, nullable=False, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": version}

    def to_dict(self):
        # SQLite returns naive datetimes; all values written here are UTC.
        def iso(value):
            return value.replace(tzinfo=value.tzinfo or timezone.utc).isoformat()

        return {
            "id": self.id,
            "title": self.title,
            "messages": self.messages,
            "language": self.language,
            "channels": self.channels,
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
            "simulation": True,
            "version": self.version,
        }


class LoginSession(db.Model):
    token_hash = db.Column(db.String(64), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    auth_version = db.Column(db.String(64), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False, index=True)


class AccountToken(db.Model):
    token_hash = db.Column(db.String(64), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    purpose = db.Column(db.String(12), nullable=False)
    auth_version = db.Column(db.String(64), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used_at = db.Column(db.DateTime(timezone=True))


class RateBucket(db.Model):
    key = db.Column(db.String(64), primary_key=True)
    count = db.Column(db.Integer, nullable=False)
    expires_at = db.Column(db.Integer, nullable=False, index=True)


class SchemaVersion(db.Model):
    revision = db.Column(db.Integer, primary_key=True)
