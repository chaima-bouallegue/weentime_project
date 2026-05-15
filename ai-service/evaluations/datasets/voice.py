from __future__ import annotations

VOICE_DATASET = [
    {"id": "voice-fr-leave", "locale": "fr", "transcript": "je veux un congé demain", "expected_intent": "leave.create"},
    {"id": "voice-en-leave", "locale": "en", "transcript": "I need leave tomorrow", "expected_intent": "leave.create"},
    {"id": "voice-ar-leave", "locale": "ar", "transcript": "أريد إجازة غدا", "expected_intent": "leave.create"},
    {"id": "voice-tn-leave", "locale": "tn", "transcript": "nheb congé ghodwa", "expected_intent": "leave.create", "normalizes": {"ghodwa": "tomorrow"}},
    {"id": "voice-tn-pointage", "locale": "tn", "transcript": "nheb npointi", "expected_intent": "attendance.check"},
    {"id": "voice-tn-auth", "locale": "tn", "transcript": "nheb autorisation", "expected_intent": "authorization.create"},
]
