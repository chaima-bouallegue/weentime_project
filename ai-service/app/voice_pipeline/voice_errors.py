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
    "audio_cancelled": "Traitement audio interrompu. Reessayez.",
    "stt_unavailable": "Service de transcription indisponible. Reessayez dans quelques instants.",
    "stt_timeout": "La transcription a pris trop de temps. Veuillez réessayer avec un message plus court.",
}

VOICE_ERROR_TRANSLATIONS = {
    "en": {
        "missing_jwt": "Authorization header is required.",
        "empty_audio": "Empty audio.",
        "short_audio": "Audio is too short.",
        "silent_audio": "I did not hear anything.",
        "no_voice_detected": "No voice detected.",
        "unclean_transcription": "I did not understand clearly. Could you repeat?",
        "invalid_audio": "Invalid audio, please try again.",
        "audio_processing_failed": "Audio error, please try again.",
        "audio_cancelled": "Audio processing was interrupted. Try again.",
        "stt_unavailable": "Transcription service is unavailable. Try again in a moment.",
        "stt_timeout": "Transcription took too long. Try again with a shorter message.",
    },
    "ar": {
        "missing_jwt": "يلزم تسجيل الدخول.",
        "empty_audio": "الصوت فارغ.",
        "short_audio": "الصوت قصير جدا.",
        "silent_audio": "لم أسمع شيئا.",
        "no_voice_detected": "لم يتم اكتشاف صوت.",
        "unclean_transcription": "لم أفهم بوضوح. هل يمكنك الإعادة؟",
        "invalid_audio": "الصوت غير صالح، حاول مرة أخرى.",
        "audio_processing_failed": "حدث خطأ في الصوت، حاول مرة أخرى.",
        "audio_cancelled": "تم إيقاف معالجة الصوت. حاول مرة أخرى.",
        "stt_unavailable": "خدمة التفريغ الصوتي غير متاحة حاليا. حاول بعد قليل.",
        "stt_timeout": "استغرقت عملية التفريغ وقتا طويلا. حاول برسالة أقصر.",
    },
    "tn": {
        "missing_jwt": "Lazem tkoun connecté.",
        "empty_audio": "Audio feragh.",
        "short_audio": "Audio ksir barcha.",
        "silent_audio": "Ma sma3t chay.",
        "no_voice_detected": "Ma fama hatta sout.",
        "unclean_transcription": "Ma fhemtch behi. Tnajjem taawed?",
        "invalid_audio": "Audio moch valid, jarreb mara okhra.",
        "audio_processing_failed": "Saret ghalta fel audio, jarreb mara okhra.",
        "audio_cancelled": "Traitement audio twa9ef. Jarreb mara okhra.",
        "stt_unavailable": "Service transcription moch disponible taw. Jarreb baad chweya.",
        "stt_timeout": "Transcription twalet barcha. Jarreb message aksar.",
    },
}

def voice_error_payload(code: str, *, message: str | None = None, language: str | None = None) -> dict:
    normalized_language = (language or "fr").strip().lower()
    localized = VOICE_ERROR_TRANSLATIONS.get(normalized_language, {}).get(code)
    return {
        "success": False,
        "data": None,
        "warnings": [],
        "error": {
            "code": code,
            "message": message or localized or VOICE_ERROR_MESSAGES.get(code, "Erreur audio, veuillez reessayer."),
            "details": {},
        },
    }
