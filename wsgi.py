"""Production entry point: run with Gunicorn after applying migrations."""

from app import create_app

app = create_app()
