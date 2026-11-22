"""Random, purpose-bound, expiring, single-use account links."""

import secrets
from datetime import timedelta

from flask import current_app

from extensions import db
from mailer import send_account_email
from models import AccountToken, User, utcnow
from security import digest


def send_token_email(user, purpose):
    token = secrets.token_urlsafe(32)
    expiry = timedelta(hours=24) if purpose == "verify" else timedelta(minutes=30)
    db.session.add(AccountToken(token_hash=digest(token), user_id=user.id,
        purpose=purpose, auth_version=user.auth_version, expires_at=utcnow() + expiry))
    db.session.commit()
    endpoint = "verify-email" if purpose == "verify" else "reset-password"
    url = f"{current_app.config['PUBLIC_BASE_URL']}/{endpoint}/{token}"
    if purpose == "verify":
        subject = "Verify your CivicGuard email"
        body = f"Hello {user.name},\n\nConfirm your email address to open your CivicGuard workspace:\n\n{url}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.\n\nCivicGuard is a simulation workspace, not an emergency alert service."
    else:
        subject = "Reset your CivicGuard password"
        body = f"A password reset was requested for your CivicGuard account.\n\nChoose a new password here:\n\n{url}\n\nThis link expires in 30 minutes and can be used once. If you did not request this, ignore this email; your password has not changed."
    send_account_email(user.email, subject, body)


def find_token(token, purpose):
    if not isinstance(token, str) or not 30 <= len(token) <= 128:
        return None
    return db.session.scalar(db.select(AccountToken).join(User).where(
        AccountToken.token_hash == digest(token), AccountToken.purpose == purpose,
        AccountToken.used_at.is_(None), AccountToken.expires_at > utcnow(),
        AccountToken.auth_version == User.auth_version,
    ))


def consume_token(token, purpose):
    record = find_token(token, purpose)
    if record is None:
        return None
    # Lock the account across simultaneous password reset/change/delete requests.
    user = db.session.scalar(db.select(User).where(User.id == record.user_id)
        .with_for_update().execution_options(populate_existing=True))
    if user is None or user.auth_version != record.auth_version:
        return None
    claimed = db.session.execute(db.update(AccountToken).where(
        AccountToken.token_hash == record.token_hash, AccountToken.used_at.is_(None),
        AccountToken.expires_at > utcnow(),
    ).values(used_at=utcnow()).returning(AccountToken.user_id)
        .execution_options(synchronize_session=False)).scalar()
    return user if claimed is not None else None
