"""Session authentication built on Flask, Werkzeug, and transactional SQLAlchemy.

Cookies contain only an opaque login token. Its digest is stored in the database,
so logout and password resets invalidate even copied cookies. CSRF tokens are
independent, random, bound to the signed session, and rotated at login.
"""

import hashlib
import hmac
import secrets
import time
from datetime import timedelta
from functools import wraps
from urllib.parse import urlsplit

from flask import current_app, g, jsonify, redirect, request, session, url_for
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from werkzeug.exceptions import BadRequest, TooManyRequests
from werkzeug.local import LocalProxy

from extensions import db
from models import LoginSession, RateBucket, User, utcnow


def digest(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class AnonymousUser:
    is_authenticated = False
    email_verified = False

    def get_id(self):
        return None


def get_user():
    if "_account_user" not in g:
        user = None
        token = session.get("login_token")
        if isinstance(token, str) and len(token) <= 128:
            user = db.session.scalar(db.select(User).join(LoginSession).where(
                LoginSession.token_hash == digest(token),
                LoginSession.expires_at > utcnow(),
                LoginSession.auth_version == User.auth_version,
            ))
        g._account_user = user or AnonymousUser()
    return g._account_user


current_user = LocalProxy(get_user)


def get_remote_address():
    return request.remote_addr or "unknown"


def login_user(user):
    session.clear()
    token = secrets.token_urlsafe(32)
    db.session.add(LoginSession(token_hash=digest(token), user_id=user.id,
        auth_version=user.auth_version,
        expires_at=utcnow() + current_app.config["PERMANENT_SESSION_LIFETIME"]))
    db.session.commit()
    session["login_token"] = token
    session.permanent = True
    g._account_user = user


def logout_user():
    token = session.get("login_token")
    if isinstance(token, str):
        db.session.execute(db.delete(LoginSession).where(LoginSession.token_hash == digest(token)))
        db.session.commit()
    session.clear()
    g._account_user = AnonymousUser()


def login_required(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated:
            if request.path.startswith("/api/"):
                return jsonify(error="authentication_required", message="Sign in to continue."), 401
            return redirect(url_for("auth.login"))
        return function(*args, **kwargs)
    return wrapped


def verified_required(function):
    @wraps(function)
    @login_required
    def wrapped(*args, **kwargs):
        if current_app.config["EMAIL_VERIFICATION_REQUIRED"] and not current_user.email_verified:
            if request.path.startswith("/api/"):
                return jsonify(error="email_unverified", message="Verify your email before using your workspace."), 403
            return redirect(url_for("auth.verify_notice"))
        return function(*args, **kwargs)
    return wrapped


class CSRFError(BadRequest):
    description = "Your form expired. Reload the page and try again."


def csrf_token():
    if not session.get("csrf_token") or time.time() - session.get("csrf_issued_at", 0) > 12 * 3600:
        session["csrf_token"] = secrets.token_urlsafe(32)
        session["csrf_issued_at"] = int(time.time())
    return session["csrf_token"]


def init_security(app):
    app.jinja_env.globals["csrf_token"] = csrf_token
    app.context_processor(lambda: {"current_user": current_user})

    @app.before_request
    def protect_request():
        if request.path == "/api/generate-alert":
            request.max_content_length = 4096
        if request.method not in {"POST", "PUT", "PATCH", "DELETE"} or not app.config.get("WTF_CSRF_ENABLED", True):
            return
        expected = session.get("csrf_token")
        supplied = request.headers.get("X-CSRFToken") or request.form.get("csrf_token")
        if (not isinstance(expected, str) or not isinstance(supplied, str) or len(supplied) > 128 or
                time.time() - session.get("csrf_issued_at", 0) > 12 * 3600 or
                not hmac.compare_digest(expected.encode(), supplied.encode())):
            raise CSRFError()
        origin = request.headers.get("Origin")
        if origin:
            parsed = urlsplit(origin)
            if (parsed.scheme, parsed.netloc) != (request.scheme, request.host):
                raise CSRFError()


class DatabaseLimiter:
    """Fixed-window, atomic quotas shared by all processes using the database."""

    PERIODS = {"minute": 60, "hour": 3600, "day": 86400}

    def exempt(self, function):
        return function

    def limit(self, specification, methods=None, key_func=None):
        rules = []
        for item in specification.split(";"):
            count, _, period = item.strip().split()
            rules.append((int(count), self.PERIODS[period]))

        def decorator(function):
            @wraps(function)
            def wrapped(*args, **kwargs):
                if current_app.config["RATELIMIT_ENABLED"] and (not methods or request.method in methods):
                    now = int(time.time())
                    identity = str((key_func or get_remote_address)())
                    for maximum, period in rules:
                        window = now // period
                        key = digest(f"{function.__module__}.{function.__name__}:{maximum}:{period}:{window}:{identity}")
                        expires = (window + 1) * period
                        insert = pg_insert if db.engine.dialect.name == "postgresql" else sqlite_insert
                        statement = insert(RateBucket).values(key=key, count=1, expires_at=expires)
                        statement = statement.on_conflict_do_update(
                            index_elements=[RateBucket.key], set_={"count": RateBucket.count + 1},
                            where=RateBucket.count < maximum,
                        ).returning(RateBucket.count)
                        with db.engine.begin() as connection:
                            count = connection.execute(statement).scalar()
                        if count is None:
                            raise TooManyRequests(description="Too many attempts. Please try again later.", retry_after=expires - now)
                return function(*args, **kwargs)
            return wrapped
        return decorator


limiter = DatabaseLimiter()
