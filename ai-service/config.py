from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path

DEFAULT_CORS_ORIGINS = ["http://localhost:4200", "http://127.0.0.1:4200"]


def _to_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _safe_cors_origins(value: str | None) -> list[str]:
    origins = _split_csv(value)
    if not origins or "*" in origins:
        return list(DEFAULT_CORS_ORIGINS)
    return origins


class Settings:
    def __init__(self) -> None:
        self.base_dir = Path(__file__).resolve().parent

        self.app_name = os.getenv("APP_NAME", "WeenTime AI Gateway")
        self.app_env = os.getenv("APP_ENV", "development")
        self.log_level = os.getenv("LOG_LEVEL", "INFO").upper()
        self.host = os.getenv("HOST", "0.0.0.0")
        self.port = int(os.getenv("PORT", "8000"))
        self.public_base_url = os.getenv("PUBLIC_BASE_URL", f"http://localhost:{self.port}").rstrip("/")

        self.data_dir = Path(os.getenv("DATA_DIR", str(self.base_dir / "data")))
        self.rag_documents_dir = Path(os.getenv("RAG_DOCUMENTS_DIR", str(self.data_dir / "rag")))
        self.temp_audio_dir = Path(os.getenv("TEMP_AUDIO_DIR", str(self.base_dir / "temp")))
        self.generated_audio_dir = Path(
            os.getenv("GENERATED_AUDIO_DIR", str(self.base_dir / "generated_audio"))
        )
        self.generated_docs_dir = Path(
            os.getenv("GENERATED_DOCS_DIR", str(self.base_dir / "generated_docs"))
        )

        self.backend_base_url = os.getenv("BACKEND_BASE_URL", "http://localhost:8322/api/v1").rstrip("/")
        self.backend_auth_token = os.getenv("BACKEND_AUTH_TOKEN")
        self.backend_timeout_seconds = float(os.getenv("BACKEND_TIMEOUT_SECONDS", "20"))
        self.backend_retry_attempts = max(1, int(os.getenv("BACKEND_RETRY_ATTEMPTS", "2")))
        self.backend_retry_backoff_seconds = float(
            os.getenv("BACKEND_RETRY_BACKOFF_SECONDS", "0.8")
        )

        self.memory_size = max(4, int(os.getenv("MEMORY_SIZE", "20")))
        self.dedup_window_seconds = float(os.getenv("DEDUP_WINDOW_SECONDS", "60"))
        self.action_confirm_threshold = float(os.getenv("ACTION_CONFIRM_THRESHOLD", "0.72"))

        self.ai_provider_mode = os.getenv("AI_PROVIDER_MODE", "ollama").strip().lower()
        self.ai_provider_model = os.getenv("AI_PROVIDER_MODEL", "qwen2.5:3b")
        self.ai_provider_optional_model = os.getenv("AI_PROVIDER_OPTIONAL_MODEL", "qwen2.5-coder:3b-instruct")
        self.ai_provider_timeout_seconds = float(os.getenv("AI_PROVIDER_TIMEOUT_SECONDS", "20"))
        self.ai_local_device = os.getenv("AI_LOCAL_DEVICE", "cpu").strip().lower()
        self.ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
        self.ollama_model = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
        self.ollama_coder_model = os.getenv("OLLAMA_CODER_MODEL", "qwen2.5-coder:3b-instruct").strip()
        self.ollama_fallback_model = os.getenv("OLLAMA_FALLBACK_MODEL", "phi3").strip()
        self.ollama_timeout_seconds = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", str(self.ai_provider_timeout_seconds)))
        self.ollama_max_tokens = max(1, int(os.getenv("OLLAMA_MAX_TOKENS", "512")))
        self.ollama_temperature = float(os.getenv("OLLAMA_TEMPERATURE", "0.2"))

        self.stt_model = os.getenv("STT_MODEL", "base")
        self.stt_language = os.getenv("STT_LANGUAGE", "fr")
        self.stt_device = os.getenv("STT_DEVICE", "cpu").strip().lower()
        self.ffmpeg_binary = os.getenv("FFMPEG_BINARY", "ffmpeg")
        self.voice_min_chunk_bytes = int(os.getenv("VOICE_MIN_CHUNK_BYTES", "100"))
        self.voice_min_input_bytes = int(os.getenv("VOICE_MIN_INPUT_BYTES", "5000"))
        self.voice_min_buffer_seconds = float(os.getenv("VOICE_MIN_BUFFER_SECONDS", "1.0"))
        self.voice_min_words = max(1, int(os.getenv("VOICE_MIN_WORDS", "2")))
        self.voice_min_duration_seconds = float(os.getenv("VOICE_MIN_DURATION_SECONDS", "1.5"))
        self.voice_min_detected_volume = float(os.getenv("VOICE_MIN_DETECTED_VOLUME", "0.15"))
        self.voice_min_peak_amplitude = int(os.getenv("VOICE_MIN_PEAK_AMPLITUDE", "180"))
        self.voice_silence_seconds = float(os.getenv("VOICE_SILENCE_SECONDS", "1.0"))
        self.voice_vad_aggressiveness = int(os.getenv("VOICE_VAD_AGGRESSIVENESS", "1"))
        self.voice_min_voiced_ms = int(os.getenv("VOICE_MIN_VOICED_MS", "500"))
        self.voice_frame_ms = int(os.getenv("VOICE_FRAME_MS", "30"))
        self.voice_noise_phrases = _split_csv(
            os.getenv("VOICE_NOISE_PHRASES", "bla bla,hum hum,uh uh")
        )
        self.executor_retry_attempts = max(1, int(os.getenv("EXECUTOR_RETRY_ATTEMPTS", "2")))
        self.executor_cache_ttl_seconds = max(1, int(os.getenv("EXECUTOR_CACHE_TTL_SECONDS", "30")))
        self.autonomous_max_task_attempts = max(1, int(os.getenv("AUTONOMOUS_MAX_TASK_ATTEMPTS", "2")))

        self.tts_enabled = _to_bool(os.getenv("TTS_ENABLED"), True)
        self.tts_model = os.getenv("TTS_MODEL", "tts_models/fr/css10/vits")
        self.tts_use_gpu = _to_bool(os.getenv("TTS_USE_GPU"), False)

        self.rag_keywords = _split_csv(os.getenv("RAG_KEYWORDS", "politique,reglement,procedure"))
        self.rag_search_limit = max(1, int(os.getenv("RAG_SEARCH_LIMIT", "3")))
        self.rag_provider = os.getenv("RAG_PROVIDER", "local_keyword").strip().lower()
        self.chroma_enabled = _to_bool(os.getenv("CHROMA_ENABLED"), False)
        self.chroma_persist_dir = Path(os.getenv("CHROMA_PERSIST_DIR", str(self.base_dir / "storage" / "chroma")))
        self.chroma_collection_name = os.getenv("CHROMA_COLLECTION_NAME", "weentime_policy").strip()
        self.chroma_embedding_model = os.getenv("CHROMA_EMBEDDING_MODEL", "nomic-embed-text").strip()
        self.chroma_top_k = max(1, int(os.getenv("CHROMA_TOP_K", "5")))
        self.rag_require_citations = _to_bool(os.getenv("RAG_REQUIRE_CITATIONS"), True)
        self.rag_tenant_filter_required = _to_bool(os.getenv("RAG_TENANT_FILTER_REQUIRED"), True)
        self.cors_origins = _safe_cors_origins(os.getenv("CORS_ORIGINS"))

        self.braintrust_enabled = _to_bool(os.getenv("BRAINTRUST_ENABLED"), False)
        self.braintrust_api_key = os.getenv("BRAINTRUST_API_KEY")
        self.braintrust_project_name = os.getenv("BRAINTRUST_PROJECT_NAME", "WeenTime AI Copilot")
        self.braintrust_project_id = os.getenv("BRAINTRUST_PROJECT_ID")
        self.braintrust_env = os.getenv("BRAINTRUST_ENV", self.app_env)
        self.braintrust_log_inputs = _to_bool(os.getenv("BRAINTRUST_LOG_INPUTS"), False)
        self.braintrust_log_audio = _to_bool(os.getenv("BRAINTRUST_LOG_AUDIO"), False)
        self.braintrust_sample_rate = max(
            0.0,
            min(1.0, float(os.getenv("BRAINTRUST_SAMPLE_RATE", "1.0"))),
        )
        self.braintrust_redact_emails = _to_bool(os.getenv("BRAINTRUST_REDACT_EMAILS"), True)
        self.braintrust_max_text_length = max(64, int(os.getenv("BRAINTRUST_MAX_TEXT_LENGTH", "1200")))

        self.redis_enabled = _to_bool(os.getenv("REDIS_ENABLED"), False)
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379").strip()
        self.redis_ai_events_channel = os.getenv("REDIS_AI_EVENTS_CHANNEL", "ai.events.generated").strip()
        self.redis_default_ttl_seconds = max(1, int(os.getenv("REDIS_DEFAULT_TTL_SECONDS", "300")))

        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.rag_documents_dir.mkdir(parents=True, exist_ok=True)
        self.temp_audio_dir.mkdir(parents=True, exist_ok=True)
        self.generated_audio_dir.mkdir(parents=True, exist_ok=True)
        self.generated_docs_dir.mkdir(parents=True, exist_ok=True)


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        force=True,
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    configure_logging(settings.log_level)
    return settings
