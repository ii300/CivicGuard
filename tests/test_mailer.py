"""Check TLS transport and failure handling without sending email."""
import smtplib
import unittest
from unittest.mock import patch

from app import create_app
from extensions import db
from mailer import MailDeliveryError, send_account_email


class MailerTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({"TESTING": True, "APP_ENV": "development",
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:", "SECRET_KEY": "test-only-key"})
        self.app.config.update(MAIL_BACKEND="smtp", MAIL_FROM="CivicGuard <test@example.com>",
            SMTP_HOST="smtp.example.com", SMTP_PORT=587, SMTP_SECURITY="starttls",
            SMTP_USERNAME="test-user", SMTP_PASSWORD="test-only-password")
        self.context = self.app.app_context()
        self.context.push()
        self.addCleanup(self.context.pop)
        self.addCleanup(db.engine.dispose)
        self.addCleanup(db.session.remove)

    def test_smtp_uses_tls_and_configured_sender(self):
        with patch("mailer.smtplib.SMTP") as transport:
            send_account_email("recipient@example.com", "Test", "Test body")
            transport.assert_called_once_with(host="smtp.example.com", port=587, timeout=10)
            client = transport.return_value.__enter__.return_value
            client.starttls.assert_called_once()
            client.login.assert_called_once_with("test-user", "test-only-password")
            message = client.send_message.call_args.args[0]
            self.assertEqual(str(message["From"]), "CivicGuard <test@example.com>")
            self.assertEqual(str(message["To"]), "recipient@example.com")

    def test_delivery_failure_does_not_expose_credentials(self):
        with patch("mailer.smtplib.SMTP", side_effect=smtplib.SMTPAuthenticationError(535, b"private-provider-detail")):
            with self.assertRaises(MailDeliveryError) as result:
                send_account_email("recipient@example.com", "Test", "Test body")
        self.assertNotIn("private-provider-detail", str(result.exception))
