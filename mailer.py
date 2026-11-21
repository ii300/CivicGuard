"""TLS SMTP for production; private local email previews for development."""

import os
import secrets
import smtplib
import ssl
from email.message import EmailMessage
from email.policy import default
from email import message_from_bytes
from pathlib import Path

from flask import current_app


class MailDeliveryError(Exception):
    pass


def send_account_email(recipient, subject, body):
    config = current_app.config
    message = EmailMessage()
    message["From"] = config["MAIL_FROM"]
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)
    backend = config["MAIL_BACKEND"]
    if backend == "memory" and current_app.testing:
        current_app.extensions.setdefault("mailbox", []).append(message)
        return
    if backend == "file" and config["APP_ENV"] == "development":
        try:
            directory = Path(config["MAIL_OUTBOX"])
            directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            filename = directory / f"{secrets.token_hex(16)}.eml"
            descriptor = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as output:
                output.write(message.as_bytes())
        except OSError as error:
            raise MailDeliveryError("The local email preview could not be saved.") from error
        return
    if backend != "smtp":
        raise MailDeliveryError("Email delivery is not configured.")
    context = ssl.create_default_context()
    transport = smtplib.SMTP_SSL if config["SMTP_SECURITY"] == "ssl" else smtplib.SMTP
    kwargs = {"host": config["SMTP_HOST"], "port": config["SMTP_PORT"], "timeout": 10}
    if config["SMTP_SECURITY"] == "ssl":
        kwargs["context"] = context
    try:
        with transport(**kwargs) as client:
            if config["SMTP_SECURITY"] == "starttls":
                client.starttls(context=context)
            if config["SMTP_USERNAME"]:
                client.login(config["SMTP_USERNAME"], config["SMTP_PASSWORD"])
            client.send_message(message)
    except (OSError, smtplib.SMTPException) as error:
        current_app.logger.warning("Account email delivery failed (%s)", type(error).__name__)
        raise MailDeliveryError("Email could not be delivered. Please try again later.") from error


def latest_local_email(recipient):
    directory = Path(current_app.config["MAIL_OUTBOX"])
    for filename in sorted(directory.glob("*.eml"), key=lambda item: item.stat().st_mtime, reverse=True):
        message = message_from_bytes(filename.read_bytes(), policy=default)
        if str(message["To"]) == recipient:
            return str(message["Subject"]), message.get_body(preferencelist=("plain",)).get_content()
    return None
