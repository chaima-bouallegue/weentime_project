#!/usr/bin/env python3
"""Slice 8 — per-prompt validation against running ai-service /v2/chat.

Outputs one row per prompt with intent, type, kind, llm_used, provider,
model, intent_before_llm, and a 100-char prefix of the response text.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

URL = "http://localhost:8000/v2/chat"

PROMPTS = [
    # --- Employee ---
    ("EMPLOYEE", "nheb naamela autorisation de 2h"),
    ("EMPLOYEE", "je veux prendre une autorisation pour 2 heures"),
    ("EMPLOYEE", "aandi reunion?"),
    ("EMPLOYEE", "est ce que jai une reunion?"),
    ("EMPLOYEE", "c quoi mon planning"),
    ("EMPLOYEE", "nheb conge ghodwa"),
    ("EMPLOYEE", "Je viens d arriver"),
    ("EMPLOYEE", "أريد تصريح خروج غدا"),
    ("EMPLOYEE", "هل عندي اجتماع اليوم؟"),
    ("EMPLOYEE", "je suis malade aujourd'hui"),
    # --- Manager ---
    ("MANAGER", "Did I check in?"),
    ("MANAGER", "Pointage equipe"),
    ("MANAGER", "nheb nchouf les horaire de l equipes"),
    ("MANAGER", "approbations"),
    ("MANAGER", "pending approvals"),
    ("MANAGER", "je veut valide la demande de autorisation de amin dupont pour pause longue"),
]


def post_chat(role: str, prompt: str) -> dict:
    body = json.dumps({
        "message": prompt,
        "userId": 1,
        "role": role,
        "entrepriseId": 1,
        "metadata": {"role": role},
    }).encode("utf-8")
    req = urllib.request.Request(URL, data=body, method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"error_status": e.code, "body": e.read().decode("utf-8", errors="replace")}
    except Exception as e:  # noqa: BLE001
        return {"error_status": -1, "body": str(e)}


def short(value: str, n: int = 110) -> str:
    text = (value or "").replace("\n", " ")
    return text[:n] + ("..." if len(text) > n else "")


def run() -> None:
    print(f"{'#':>2}  {'ROLE':<8} | {'INTENT':<32} | {'TYPE':<8} | {'KIND':<28} | LLM   | PROV    | MODEL        | BEFORE")
    print("-" * 180)
    rows = []
    for i, (role, prompt) in enumerate(PROMPTS, start=1):
        resp = post_chat(role, prompt)
        data = resp.get("data") or {}
        action = data.get("actionResult") or {}
        row = {
            "n": i,
            "role": role,
            "prompt": prompt,
            "intent": data.get("intent", "-"),
            "type": data.get("type", "-"),
            "kind": action.get("kind", "-") if isinstance(action, dict) else "-",
            "llm_used": str(action.get("llm_used", "-")) if isinstance(action, dict) else "-",
            "provider": action.get("provider", "-") if isinstance(action, dict) else "-",
            "model": action.get("model", "-") if isinstance(action, dict) else "-",
            "intent_before_llm": action.get("intent_before_llm", "-") if isinstance(action, dict) else "-",
            "text": short(data.get("text", "") or resp.get("error", {}).get("message", "")),
        }
        rows.append(row)
        print(f"{i:>2}  {role:<8} | {row['intent']:<32} | {row['type']:<8} | {row['kind']:<28} | {row['llm_used']:<5} | {row['provider']:<7} | {row['model'] or '-':<12} | {row['intent_before_llm']}")
        print(f"     PROMPT: {short(prompt, 140)}")
        print(f"     TEXT:   {row['text']}")
        print()

    # Summary
    fallback = [r for r in rows if r["intent"].startswith("fallback.")]
    capability = [r for r in rows if r["kind"] == "capability_unavailable"]
    asks = [r for r in rows if r["type"] == "ask"]
    confirms = [r for r in rows if r["type"] == "confirm_action"]
    print("=" * 70)
    print(f"TOTAL: {len(rows)} prompts")
    print(f"  fallback.*       : {len(fallback)}")
    print(f"  capability_unav. : {len(capability)}")
    print(f"  ask (slot-fill)  : {len(asks)}")
    print(f"  confirm_action   : {len(confirms)}")
    print(f"  llm_used=True    : {sum(1 for r in rows if r['llm_used'] == 'True')}")
    print(f"  provider=ollama  : {sum(1 for r in rows if r['provider'] == 'ollama')}")
    if fallback:
        print("\nFALLBACK CASES (would have been the bugs from the screenshots):")
        for r in fallback:
            print(f"  #{r['n']}  {r['role']} '{r['prompt']}' -> {r['intent']}")


if __name__ == "__main__":
    run()
