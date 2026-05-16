#!/bin/bash
# Slice 8 — per-prompt validation against running ai-service /v2/chat
# Outputs one row per prompt: role | prompt | intent | type | llm_used | text-prefix
set -u

post_chat() {
  local role="$1" prompt="$2"
  curl -sS -m 15 -X POST http://localhost:8000/v2/chat \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg m "$prompt" --arg r "$role" '{message:$m,userId:1,role:$r,entrepriseId:1,metadata:{role:$r}}')"
}

run_row() {
  local role="$1" prompt="$2"
  local resp=$(post_chat "$role" "$prompt")
  local intent=$(echo "$resp" | jq -r '.data.intent // "-"')
  local type=$(echo "$resp" | jq -r '.data.type // "-"')
  local kind=$(echo "$resp" | jq -r '.data.actionResult.kind // "-"')
  local llm=$(echo "$resp" | jq -r '.data.actionResult.llm_used // "-"')
  local provider=$(echo "$resp" | jq -r '.data.actionResult.provider // "-"')
  local model=$(echo "$resp" | jq -r '.data.actionResult.model // "-"')
  local before=$(echo "$resp" | jq -r '.data.actionResult.intent_before_llm // "-"')
  local text=$(echo "$resp" | jq -r '.data.text // .error.message // "-"' | tr '\n' ' ' | cut -c1-100)
  printf '%-9s | intent=%-35s type=%-12s kind=%-30s llm=%-5s prov=%-7s mdl=%-12s before=%-25s\n  -> %s\n' \
    "$role" "$intent" "$type" "$kind" "$llm" "$provider" "$model" "$before" "$text"
  printf '\n'
}

echo "===== EMPLOYEE PROMPTS ====="
run_row EMPLOYEE "nheb naamela autorisation de 2h"
run_row EMPLOYEE "je veux prendre une autorisation pour 2 heures"
run_row EMPLOYEE "aandi reunion?"
run_row EMPLOYEE "est ce que jai une reunion?"
run_row EMPLOYEE "c quoi mon planning"
run_row EMPLOYEE "nheb conge ghodwa"
run_row EMPLOYEE "Je viens d arriver"
run_row EMPLOYEE "أريد تصريح خروج غدا"
run_row EMPLOYEE "هل عندي اجتماع اليوم؟"
run_row EMPLOYEE "je suis malade aujourd'hui"

echo "===== MANAGER PROMPTS ====="
run_row MANAGER "Did I check in?"
run_row MANAGER "Pointage equipe"
run_row MANAGER "nheb nchouf les horaire de l equipes"
run_row MANAGER "approbations"
run_row MANAGER "pending approvals"
run_row MANAGER "je veut valide la demande de autorisation de amin dupont pour pause longue"
