"""
Evaluates downstream AI pipeline results for the actual Whisper output from Test 3 and Test 4.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AI_SERVICE_DIR))

from app.nlp.language_detector import detect_language, resolve_response_language
from chatbot_test_helpers import send_chatbot_message

# Transcripts actually produced by Whisper base model on Test 3 and Test 4:
WHISPER_OUTPUT_TEST_3 = "ne venez pas wantier à l'homme"
WHISPER_OUTPUT_TEST_4 = "nheb na 3 rêves soldes de congé petit il 3 i"

async def eval_transcripts():
    print("=" * 72)
    print("  DOWNSTREAM PIPELINE EVALUATION FOR TEST 3 AND TEST 4")
    print("=" * 72)

    # Test 3
    lang_3 = detect_language(WHISPER_OUTPUT_TEST_3)
    resp_3, _ = await send_chatbot_message(WHISPER_OUTPUT_TEST_3, role="EMPLOYEE", language=lang_3)
    print(f"\n--- TEST 3: Original Input: \"nheb npointi el youm\" ---")
    print(f"  Whisper Raw Transcript: \"ne venez pas wantier à l'homme.\"")
    print(f"  Detected Language:     {lang_3}")
    print(f"  Final Intent:          {getattr(resp_3, 'intent', 'N/A')}")
    print(f"  Tool Calls:            {getattr(resp_3, 'toolCalls', getattr(resp_3, 'tool_calls', []))}")
    print(f"  Final Message/Text:    {getattr(resp_3, 'message', getattr(resp_3, 'text', getattr(resp_3, 'response', 'N/A')))}")

    # Test 4
    lang_4 = detect_language(WHISPER_OUTPUT_TEST_4)
    resp_4, _ = await send_chatbot_message(WHISPER_OUTPUT_TEST_4, role="EMPLOYEE", language=lang_4)
    print(f"\n--- TEST 4: Original Input: \"nheb na3ref solde de conge mte3i\" ---")
    print(f"  Whisper Raw Transcript: \"nheb, na, 3 rêves soldes de congé, petit, il, 3 i ?\"")
    print(f"  Detected Language:     {lang_4}")
    print(f"  Final Intent:          {getattr(resp_4, 'intent', 'N/A')}")
    print(f"  Tool Calls:            {getattr(resp_4, 'toolCalls', getattr(resp_4, 'tool_calls', []))}")
    print(f"  Final Message/Text:    {getattr(resp_4, 'message', getattr(resp_4, 'text', getattr(resp_4, 'response', 'N/A')))}")

if __name__ == "__main__":
    asyncio.run(eval_transcripts())
