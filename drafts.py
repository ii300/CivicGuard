"""Owner-scoped CRUD for multilingual simulation drafts."""

from flask import Blueprint, jsonify, request
from sqlalchemy.orm.exc import StaleDataError

from extensions import db
from models import SavedDraft, User
from security import current_user, get_remote_address, limiter, verified_required

drafts_api = Blueprint("drafts", __name__, url_prefix="/api/drafts")
LANGUAGES = frozenset({"en", "es", "zh"})
CHANNELS = frozenset({"WEA", "EAS", "SMS", "Social"})


def validate_draft(data):
    if not isinstance(data, dict):
        return "The body must be a JSON object."
    title, messages = data.get("title"), data.get("messages")
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 100 or not title.strip().isprintable():
        return "Enter a title between 1 and 100 characters."
    if not isinstance(messages, dict) or set(messages) != LANGUAGES:
        return "Include English, Spanish, and Chinese drafts."
    if any(not isinstance(text, str) or len(text) > 4000 for text in messages.values()):
        return "Each language draft must be text with at most 4,000 characters."
    if not any(text.strip() for text in messages.values()):
        return "Write at least one language draft before saving."
    if not isinstance(data.get("language"), str) or data["language"] not in LANGUAGES:
        return "Choose a supported language."
    channels = data.get("channels")
    if (not isinstance(channels, list) or len(channels) > 4 or
            any(not isinstance(item, str) or item not in CHANNELS for item in channels) or
            len(set(channels)) != len(channels)):
        return "Choose valid simulated channels without duplicates."
    return None


def owned_draft(draft_id):
    # A foreign user's ID and a missing ID both return 404.
    return db.first_or_404(db.select(SavedDraft).where(
        SavedDraft.id == draft_id, SavedDraft.user_id == current_user.id,
    ))


@drafts_api.get("")
@verified_required
def list_drafts():
    records = db.session.scalars(db.select(SavedDraft).where(
        SavedDraft.user_id == current_user.id,
    ).order_by(SavedDraft.updated_at.desc(), SavedDraft.id.desc())).all()
    return jsonify(drafts=[record.to_dict() for record in records])


@drafts_api.get("/<int:draft_id>")
@verified_required
def get_draft(draft_id):
    return jsonify(draft=owned_draft(draft_id).to_dict())


@drafts_api.post("")
@drafts_api.put("/<int:draft_id>")
@verified_required
@limiter.limit("30 per minute", key_func=lambda: current_user.get_id() or get_remote_address())
def save_draft(draft_id=None):
    record = owned_draft(draft_id) if draft_id is not None else None
    if not request.is_json:
        return jsonify(error="invalid_request", message="Send an application/json body."), 415
    data = request.get_json(silent=True)
    error = validate_draft(data)
    if error:
        return jsonify(error="invalid_request", message=error), 400
    if record is not None and (type(data.get("version")) is not int or data["version"] != record.version):
        return jsonify(error="version_conflict", message="This draft changed in another tab or device. Open the latest version or save your edits as a new draft."), 409
    if record is None:
        # Serialize per-account creates so concurrent requests cannot bypass the quota.
        db.session.scalar(db.select(User).where(User.id == current_user.id).with_for_update())
        count = db.session.scalar(db.select(db.func.count()).select_from(SavedDraft).where(
            SavedDraft.user_id == current_user.id,
        ))
        if count >= 100:
            return jsonify(error="draft_limit", message="You have 100 saved drafts. Delete one before creating another."), 409
        record = SavedDraft(user_id=current_user.id)
        db.session.add(record)
    record.title = data["title"].strip()
    record.messages = data["messages"]
    record.language = data["language"]
    record.channels = data["channels"]
    try:
        db.session.commit()
    except StaleDataError:
        db.session.rollback()
        return jsonify(error="version_conflict", message="This draft changed in another tab or device. Open the latest version or save as a new draft."), 409
    return jsonify(draft=record.to_dict()), 201 if draft_id is None else 200


@drafts_api.delete("/<int:draft_id>")
@verified_required
def delete_draft(draft_id):
    db.session.delete(owned_draft(draft_id))
    db.session.commit()
    return "", 204
