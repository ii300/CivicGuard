"""Registration, verified email, password recovery, and account settings."""

import re
import secrets
from email.headerregistry import Address

from flask import Blueprint, abort, current_app, flash, jsonify, redirect, render_template, request, session, url_for
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from account_tokens import consume_token, find_token, send_token_email
from extensions import db
from mailer import MailDeliveryError, latest_local_email
from models import AccountToken, AlertRecord, LoginSession, SavedDraft, User
from security import current_user, limiter, login_required, login_user, logout_user

auth = Blueprint("auth", __name__)
_DUMMY_PASSWORD_HASH = generate_password_hash(secrets.token_urlsafe(32), method="scrypt")


def normalized_email(value):
    if not isinstance(value, str) or len(value.strip()) > 254:
        return None
    try:
        address = Address(addr_spec=value.strip())
        local = address.username
        domain = address.domain.encode("idna").decode("ascii").lower()
    except (ValueError, UnicodeError, IndexError):
        return None
    # Deliberately support conventional email identifiers and IDNA domains.
    # Reject display names, quoted local-parts, control characters, and local-only domains.
    if (not local or len(local) > 64 or not re.fullmatch(r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+", local) or
            local.startswith(".") or local.endswith(".") or ".." in local or
            "." not in domain or len(domain) > 253 or
            any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in domain.split("."))):
        return None
    result = f"{local.casefold()}@{domain}"
    return result if len(result) <= 254 else None


def password_error(password, confirmation):
    if not 12 <= len(password) <= 128 or not password.strip():
        return "Use a password between 12 and 128 characters. Spaces are allowed."
    if password != confirmation:
        return "The passwords do not match."
    return None


def account_destination():
    return "auth.verify_notice" if current_app.config["EMAIL_VERIFICATION_REQUIRED"] and not current_user.email_verified else "console"


def try_verification_email(user):
    try:
        send_token_email(user, "verify")
        return True
    except MailDeliveryError:
        flash("Your account was created, but the verification email could not be sent. Please use Resend verification email.", "error")
        return False


@auth.route("/register", methods=["GET", "POST"])
@limiter.limit("5 per minute; 30 per hour", methods=["POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for(account_destination()))
    error = None
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = normalized_email(request.form.get("email", ""))
        password = request.form.get("password", "")
        if not 1 <= len(name) <= 80 or not name.isprintable():
            error = "Enter a name between 1 and 80 characters."
        elif not email:
            error = "Enter a valid email address."
        else:
            error = password_error(password, request.form.get("confirm_password"))
        if error is None:
            user = User(name=name, email=email)
            user.set_password(password)
            db.session.add(user)
            try:
                db.session.commit()
            except IntegrityError:
                db.session.rollback()
                error = "An account already uses this email. Sign in or reset your password."
            else:
                login_user(user)
                if current_app.config["EMAIL_VERIFICATION_REQUIRED"]:
                    try_verification_email(user)
                return redirect(url_for(account_destination()), code=303)
    return render_template("templates/auth.html", mode="register", error=error), 400 if error else 200


@auth.route("/login", methods=["GET", "POST"])
@limiter.limit("10 per minute; 60 per hour", methods=["POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for(account_destination()))
    error = None
    if request.method == "POST":
        email = normalized_email(request.form.get("email", ""))
        password = request.form.get("password", "")
        user = db.session.scalar(db.select(User).where(User.email == email)) if email else None
        valid = check_password_hash(user.password_hash if user else _DUMMY_PASSWORD_HASH, password[:128])
        if not user or not valid or len(password) > 128:
            error = "Email or password is incorrect."
        else:
            login_user(user)
            return redirect(url_for(account_destination()), code=303)
    return render_template("templates/auth.html", mode="login", error=error), 400 if error else 200


@auth.post("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("index"), code=303)


@auth.get("/verify-email")
@login_required
def verify_notice():
    if current_user.email_verified:
        return redirect(url_for("console"))
    return render_template("templates/verify.html")


@auth.post("/verify-email/resend")
@login_required
@limiter.limit("1 per minute; 5 per hour", key_func=lambda: current_user.get_id())
def resend_verification():
    if not current_user.email_verified:
        if try_verification_email(current_user):
            flash("Verification email sent. Check your inbox and spam folder.", "success")
    return redirect(url_for("auth.verify_notice"), code=303)


@auth.route("/verify-email/<token>", methods=["GET", "POST"])
@limiter.limit("30 per minute")
def verify_email(token):
    record = find_token(token, "verify")
    if record is None:
        return render_template("templates/token.html", purpose="verify", invalid=True), 400
    if request.method == "POST":
        user = consume_token(token, "verify")
        if user is None:
            return render_template("templates/token.html", purpose="verify", invalid=True), 400
        user.email_verified = True
        db.session.commit()
        flash("Email verified. Sign in to open your workspace.", "success")
        return redirect(url_for("console") if current_user.is_authenticated and current_user.id == user.id else url_for("auth.login"), code=303)
    # GET does not consume the token; email scanners cannot verify an account.
    return render_template("templates/token.html", purpose="verify", invalid=False)


@auth.route("/forgot-password", methods=["GET", "POST"])
@limiter.limit("3 per minute; 10 per hour", methods=["POST"])
def forgot_password():
    sent = False
    if request.method == "POST":
        email = normalized_email(request.form.get("email", ""))
        user = db.session.scalar(db.select(User).where(User.email == email)) if email else None
        if user:
            try:
                send_token_email(user, "reset")
            except MailDeliveryError:
                pass  # Same response for unknown addresses and delivery failures.
        sent = True
    return render_template("templates/recovery.html", sent=sent)


@auth.route("/reset-password/<token>", methods=["GET", "POST"])
@limiter.limit("10 per minute")
def reset_password(token):
    if find_token(token, "reset") is None:
        return render_template("templates/token.html", purpose="reset", invalid=True), 400
    error = None
    if request.method == "POST":
        password = request.form.get("password", "")
        error = password_error(password, request.form.get("confirm_password"))
        if error is None:
            user = consume_token(token, "reset")
            if user is None:
                return render_template("templates/token.html", purpose="reset", invalid=True), 400
            user.set_password(password)
            user.auth_version = secrets.token_hex(32)
            # Possessing the reset link also proves control of this email address.
            user.email_verified = True
            db.session.execute(db.delete(LoginSession).where(LoginSession.user_id == user.id))
            db.session.commit()
            logout_user()
            flash("Password reset. All previous sessions were signed out. Sign in with your new password.", "success")
            return redirect(url_for("auth.login"), code=303)
    return render_template("templates/token.html", purpose="reset", invalid=False, error=error), 400 if error else 200


@auth.route("/account", methods=["GET", "POST"])
@login_required
@limiter.limit("10 per minute", methods=["POST"], key_func=lambda: current_user.get_id())
def account():
    error = None
    if request.method == "POST":
        action = request.form.get("action")
        user = db.session.scalar(db.select(User).where(User.id == current_user.id)
            .with_for_update().execution_options(populate_existing=True))
        if action == "profile":
            name = request.form.get("name", "").strip()
            if not 1 <= len(name) <= 80 or not name.isprintable():
                error = "Enter a name between 1 and 80 characters."
            else:
                user.name = name
                db.session.commit()
                flash("Profile updated.", "success")
        elif action in {"password", "delete"}:
            current_password = request.form.get("current_password", "")
            if len(current_password) > 128 or not user.check_password(current_password):
                error = "Your current password is incorrect."
            elif action == "password":
                password = request.form.get("password", "")
                error = password_error(password, request.form.get("confirm_password"))
                if error is None:
                    user.set_password(password)
                    user.auth_version = secrets.token_hex(32)
                    db.session.execute(db.delete(LoginSession).where(LoginSession.user_id == user.id))
                    db.session.commit()
                    logout_user()
                    flash("Password changed. Sign in again on your devices.", "success")
                    return redirect(url_for("auth.login"), code=303)
            elif request.form.get("confirmation") != "DELETE":
                error = "Type DELETE to confirm permanent account deletion."
            else:
                for model in (AccountToken, LoginSession, SavedDraft, AlertRecord):
                    db.session.execute(db.delete(model).where(model.user_id == user.id))
                db.session.delete(user)
                db.session.commit()
                session.clear()
                flash("Your account and saved drafts have been deleted.", "success")
                return redirect(url_for("index"), code=303)
        else:
            abort(400)
        if error is None:
            return redirect(url_for("auth.account"), code=303)
        db.session.rollback()
    return render_template("templates/account.html", error=error), 400 if error else 200


@auth.get("/dev/email-preview")
@login_required
def email_preview():
    if (current_app.config["APP_ENV"] != "development" or current_app.config["MAIL_BACKEND"] != "file" or
            request.remote_addr not in {"127.0.0.1", "::1"}):
        abort(404)
    email = latest_local_email(current_user.email)
    if email is None:
        abort(404)
    subject, body = email
    # Links are produced by our own canonical URL, not from arbitrary email HTML.
    prefix = current_app.config["PUBLIC_BASE_URL"]
    link = next((line.strip() for line in body.splitlines() if line.startswith(prefix + "/")), None)
    return render_template("templates/email_preview.html", subject=subject, body=body, link=link)


@auth.get("/account/export")
@login_required
def export_account():
    records = db.session.scalars(db.select(SavedDraft).where(SavedDraft.user_id == current_user.id)).all()
    response = jsonify(profile={"name": current_user.name, "email": current_user.email},
                       drafts=[record.to_dict() for record in records])
    response.headers["Content-Disposition"] = 'attachment; filename="civicguard-data.json"'
    response.headers["Cache-Control"] = "no-store"
    return response
