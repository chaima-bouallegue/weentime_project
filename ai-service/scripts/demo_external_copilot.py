#!/usr/bin/env python3
"""Démonstrateur d'Appel Client Externe pour l'API Copilot WeenTime (AI-as-a-Service).

Ce script simule une application cliente tierce (ex: SlackBot, Microsoft Teams,
un ERP partenaire ou une application mobile) qui interroge le Copilot WeenTime
via l'API REST sécurisée par clé d'API.

Usage:
    python scripts/demo_external_copilot.py
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Force l'encodage UTF-8 sous Windows pour éviter UnicodeEncodeError sur cp1252
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Active le support des couleurs ANSI sous Windows
if sys.platform == "win32":
    try:
        os.system("")
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:8000/api/v1/copilot"
API_KEY = "weentime_dev_secret_key_2026"

CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"


def print_banner() -> None:
    print(f"\n{CYAN}{BOLD}===================================================================={RESET}")
    print(f"{CYAN}{BOLD}         WEENTIME REUSABLE COPILOT - EXTERNAL CLIENT DEMO         {RESET}")
    print(f"{CYAN}{BOLD}           Architecture Headless Copilot / AI-as-a-Service        {RESET}")
    print(f"{CYAN}{BOLD}===================================================================={RESET}\n")


def check_health() -> bool:
    print(f"{BOLD}[1/4] Découverte & Healthcheck de l'API Copilot...{RESET}")
    url = f"{BASE_URL}/health"
    req = Request(url, method="GET")
    try:
        with urlopen(req, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
            print(f"  {GREEN}[OK] Service actif :{RESET} {data.get('service')} (v{data.get('version')})")
            print(f"  {GREEN}[OK] Mode :{RESET} {data.get('mode')}")
            print(f"  {GREEN}[OK] Capacités :{RESET} {', '.join(data.get('capabilities', []))}")
            print(f"  {GREEN}[OK] STT Whisper :{RESET} {'Prêt' if data.get('stt_available') else 'Désactivé'}")
            print(f"  {GREEN}[OK] Synthèse TTS :{RESET} {'Prête' if data.get('tts_available') else 'Désactivée'}\n")
            return True
    except (HTTPError, URLError, TimeoutError, OSError) as err:
        print(f"  {RED}[ERR] Impossible de contacter {url} : {err}{RESET}")
        print(f"  {YELLOW}Assurez-vous que ai-service est démarré sur le port 8000.{RESET}\n")
        return False


def test_chat(message: str, *, session_id: str | None = None, language: str | None = None, label: str = "") -> None:
    resolved_session = session_id or f"demo_session_{uuid.uuid4().hex[:6]}"
    print(f"{BOLD}[2/4] Test Requête Textuelle {label} :{RESET}")
    print(f"  {CYAN}Question client :{RESET} \"{message}\"")
    print(f"  {CYAN}Session ID :{RESET} {resolved_session}")
    url = f"{BASE_URL}/chat"
    payload = {
        "message": message,
        "session_id": resolved_session,
        "user_id": 42,
        "entreprise_id": 9,
        "role": "EMPLOYEE",
        "language": language,
        "metadata": {
            "client_app": "SlackWeenBot",
            "environment": "production-demo",
            "entrepriseId": 9,
        },
    }
    req = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-API-Key": API_KEY,
            "X-Request-ID": f"demo-req-{language or 'auto'}-{uuid.uuid4().hex[:4]}",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=60) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            reply = res_data.get("reply", "")
            duration = res_data.get("timings", {}).get("total_ms", 0)
            lang = res_data.get("language", "auto")
            intent = res_data.get("intent", "None")

            print(f"  {GREEN}[OK] Réponse Copilot ({duration:.1f}ms, Langue: {lang}, Intention: {intent}) :{RESET}")
            print(f"    « {reply} »\n")
    except HTTPError as err:
        err_body = err.read().decode("utf-8")
        print(f"  {RED}[ERR] Erreur HTTP {err.code} : {err_body}{RESET}\n")
    except Exception as exc:
        print(f"  {RED}[ERR] Erreur : {exc}{RESET}\n")


def test_synthesize(text: str) -> None:
    print(f"{BOLD}[3/4] Test Synthèse Vocale (TTS-as-a-Service) :{RESET}")
    url = f"{BASE_URL}/synthesize"
    payload = {"text": text, "language": "fr"}
    req = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-API-Key": API_KEY,
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=60) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            audio_url = res_data.get("audio_url")
            print(f"  {GREEN}[OK] Audio généré avec succès :{RESET} {audio_url}\n")
    except HTTPError as err:
        print(f"  {YELLOW}[WARN] Synthèse TTS indisponible : HTTP {err.code}{RESET}\n")
    except Exception as exc:
        print(f"  {YELLOW}[WARN] Synthèse TTS ignorée ({exc}){RESET}\n")


def main_demo() -> None:
    print_banner()
    if not check_health():
        sys.exit(1)

    # Scénario 1 : Français (Session dédiée)
    test_chat(
        "Quelles sont les règles de télétravail dans notre entreprise ?",
        session_id="session-telework-fr",
        language="fr",
        label="(Français)",
    )

    # Scénario 2 : Anglais (Session distincte)
    test_chat(
        "I would like to know the leave policy for vacations.",
        session_id="session-leaves-en",
        language="en",
        label="(Anglais)",
    )

    # Scénario 3 : Arabe / Tunisien (Session distincte)
    test_chat(
        "3aslema, n7eb nekhou conge jem3a jeya.",
        session_id="session-tn-dialect",
        language="tn",
        label="(Tunisien / Arabe)",
    )

    # Scénario 4 : Synthèse vocale
    test_synthesize("Votre demande a été prise en compte avec succès par le Copilot.")

    print(f"{GREEN}{BOLD}[OK] Démonstration de l'API Reusable Copilot terminée avec succès !{RESET}\n")


if __name__ == "__main__":
    main_demo()
