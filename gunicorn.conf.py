"""Public deployment entrypoint; account tokens are omitted from access logs."""
import os

bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
threads = 2
timeout = 60
accesslog = "-"
errorlog = "-"
access_log_format = '%(h)s %(m)s %(s)s %(L)s'
