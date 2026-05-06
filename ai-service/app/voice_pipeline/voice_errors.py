from __future__ import annotations

VOICE_ERROR_MESSAGES = {
    "missing_jwt": "Authorization header is required.",
    "empty_audio": "Audio vide.",
    "short_audio": "Audio trop court.",
    "silent_audio": "Je n'ai rien entendu.",
    "no_voice_detected": "Aucune voix detectee.",
    "unclean_transcription": "Je n'ai pas bien compris. Pouvez-vous repeter ?",
    "invalid_audio": "Audio invalide, veuillez reessayer.",
    "audio_processing_failed": "Erreur audio, veuillez reessayer.",
}


def voice_error_payload(code: str, *, message: str | None = None) -> dict:
    return {
        "success": False,
        "data": None,
        "warnings": [],
        "error": {
            "code": code,
            "message": message or VOICE_ERROR_MESSAGES.get(code, "Erreur audio, veuillez reessayer."),
            "details": {},
        },
    }
