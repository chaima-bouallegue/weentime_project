from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import httpx
import os
import logging
from time import perf_counter
from config import get_settings
from app.observability.braintrust_client import log_ollama_interaction

router = APIRouter(prefix="/v1/ai", tags=["Document Generation"])
logger = logging.getLogger(__name__)
settings = get_settings()

class DocumentGenerationRequest(BaseModel):
    system_prompt: str
    user_prompt: str
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    max_tokens: int = Field(default=2000, le=4000)
    language: str = "fr"
    provider: str = "gemini"  # gemini | ollama | openai
    output_format: str = "html"  # "html" (default, legacy) | "text" (plain text, no HTML injection)

class DocumentGenerationResponse(BaseModel):
    content: str
    model_used: str
    tokens_used: int = 0
    provider: str

@router.post("/generate-document", response_model=DocumentGenerationResponse)
async def generate_document(request: DocumentGenerationRequest):
    """
    Génère du contenu documentaire RH via IA.
    Tente Gemini (Cloud) en priorité, avec fallback vers Ollama (Local) en cas d'erreur.
    """
    # Only inject HTML formatting rules when output_format is "html" (default behavior).
    # When output_format is "text", the system prompt is passed through as-is,
    # allowing the caller to control the output format (e.g. plain text templates).
    if request.output_format == "html":
        html_rules = """
Génère le contenu du document en HTML propre et structuré.
Le rendu doit ressembler à un document RH officiel imprimable.

Règles strictes :
- Utilise <h1> pour le titre principal du document
  (centré, majuscules, taille importante)
- Utilise <h2> pour les titres de sections
  (couleur sombre, bordure inférieure fine)
- Utilise <p> pour les paragraphes de contenu
- Utilise <table> pour les données tabulaires
  (salaires, cotisations, retenues)
- Utilise <strong> pour les libellés de champs
- Utilise <hr> comme séparateur visuel entre sections
- Pour les données manquantes : 
  <span class='missing-data'>[À COMPLÉTER]</span>
- Pour les montants : 
  <span class='amount'>0,00 €</span>
- Espace les sections avec des marges suffisantes
- Le document doit être lisible et imprimable tel quel

Structure obligatoire pour chaque document :
1. En-tête (titre du document, entreprise, date, référence)
2. Informations employé
3. Corps du document (contenu spécifique au type)
4. Pied de document (signature RH, mentions légales)

N'inclus aucune balise html, head, body, style ou script.
Commence directement par le contenu HTML.

IMPORTANT : Retourne UNIQUEMENT le code HTML brut.
N'utilise JAMAIS de balises markdown comme ```html ou ```.
Ne mets aucun texte avant ou après le HTML.
Commence directement par la première balise HTML et termine par la dernière balise HTML.
"""
        request.system_prompt = f"{request.system_prompt}\n\n{html_rules}"
    provider = request.provider or settings.default_ai_provider
    
    if provider == "gemini":
        try:
            return await _generate_gemini(request)
        except Exception as e:
            logger.warning(f"Gemini failed: {str(e)}")
            # On ne tente Ollama que si Gemini a vraiment échoué et qu'on a pas d'autre choix
            try:
                return await _generate_ollama(request)
            except Exception:
                # Si Ollama échoue aussi (ce qui est probable chez l'utilisateur), 
                # on renvoie l'erreur d'origine de Gemini qui est plus utile
                raise HTTPException(status_code=500, detail=f"AI Service Error: {str(e)}")
    elif provider == "ollama":
        return await _generate_ollama(request)
    elif provider == "openai":
        try:
            return await _generate_openai(request)
        except Exception:
            return await _generate_ollama(request)
    else:
        # Final fallback to Gemini then Ollama
        try:
            return await _generate_gemini(request)
        except Exception:
            return await _generate_ollama(request)

import asyncio
import time
import re

def _clean_markdown_fences(content: str) -> str:
    """Remove markdown code fences from AI response."""
    content = content.strip()
    if content.startswith("```html"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    return content.strip()

# Rate limiter simple (6 secondes entre appels = 10 RPM max)
last_call_time = 0

async def _generate_gemini(
    req: DocumentGenerationRequest,
    response_mime_type: str | None = None,
) -> DocumentGenerationResponse:
    global last_call_time
    
    if not settings.gemini_api_key:
        logger.error("Gemini API key not configured")
        raise HTTPException(503, "Gemini API key not configured")

    # Respect du quota : 6 secondes de délai minimum
    now = time.time()
    elapsed = now - last_call_time
    if elapsed < 6:
        wait_for = 6 - elapsed
        logger.info(f"Rate limiting local : attente de {wait_for:.1f}s...")
        await asyncio.sleep(wait_for)
    
    last_call_time = time.time()

    # Modèle Free Tier : gemini-2.5-flash
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    headers = {
        "x-goog-api-key": settings.gemini_api_key,
    }
    
    # Structure v1beta validée avec system_instruction séparé
    payload = {
        "system_instruction": {
            "parts": [{"text": req.system_prompt}]
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": req.user_prompt}]
            }
        ],
        "generationConfig": {
            "temperature": req.temperature,
            "maxOutputTokens": req.max_tokens,
        }
    }
    if response_mime_type:
        payload["generationConfig"]["responseMimeType"] = response_mime_type

    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                logger.info(f"Appel Gemini 2.5 (Essai {attempt + 1})")
                response = await client.post(url, json=payload, headers=headers)
                
                if response.status_code != 200:
                    logger.error(f"Erreur API : {response.status_code}")
                    logger.error(f"Détails : {response.text}")
                
                if response.status_code == 429:
                    wait_time = 2 ** (attempt + 1)
                    logger.warning(f"Quota dépassé (429). Retry in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                
                response.raise_for_status()
                data = response.json()

            text = _clean_markdown_fences(data["candidates"][0]["content"]["parts"][0]["text"])
            tokens = data.get("usageMetadata", {}).get("totalTokenCount", 0)

            return DocumentGenerationResponse(
                content=text,
                model_used="gemini-2.5-flash",
                tokens_used=tokens,
                provider="gemini",
            )
        except HTTPException:
            raise
        except Exception as e:
            if attempt < max_retries - 1:
                await asyncio.sleep(2)
                continue
            logger.error(f"Gemini generation failed: {str(e)}")
            raise HTTPException(500, f"Gemini API error: {str(e)}")

async def _generate_ollama(req: DocumentGenerationRequest) -> DocumentGenerationResponse:
    """Fallback vers Gemma 3 local via Ollama."""
    ollama_url = settings.ollama_url
    model = "gemma3:4b"
    started = perf_counter()
    
    # Combiner system et user prompt pour Ollama
    full_prompt = f"{req.system_prompt}\n\n{req.user_prompt}"

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                f"{ollama_url}/api/generate",
                json={
                    "model": model, # Modèle recommandé pour le PC de l'utilisateur
                    "prompt": full_prompt,
                    "stream": False,
                    "options": {"temperature": req.temperature},
                },
            )
            response.raise_for_status()
            data = response.json()

        result = DocumentGenerationResponse(
            content=_clean_markdown_fences(data["response"]),
            model_used=model,
            tokens_used=data.get("eval_count", 0),
            provider="ollama",
        )
        log_ollama_interaction(
            input_text=req.user_prompt,
            output_text=result.content,
            model=model,
            module="document_generation",
            language=req.language,
            latency_ms=round((perf_counter() - started) * 1000, 2),
            status="success",
            endpoint="/api/generate",
            channel="document",
            max_tokens=req.max_tokens,
            temperature=req.temperature,
            metadata_extra={
                "application_endpoint": "/v1/ai/generate-document",
                "system_prompt_length": len(req.system_prompt or ""),
                "tokens_used": result.tokens_used,
            },
        )
        return result
    except Exception as e:
        logger.error(f"Ollama generation failed: {str(e)}")
        log_ollama_interaction(
            input_text=req.user_prompt,
            output_text="",
            model=model,
            module="document_generation",
            language=req.language,
            latency_ms=round((perf_counter() - started) * 1000, 2),
            status="error",
            error_type=e.__class__.__name__,
            error_message=str(e),
            endpoint="/api/generate",
            channel="document",
            max_tokens=req.max_tokens,
            temperature=req.temperature,
            timeout=isinstance(e, httpx.TimeoutException),
            metadata_extra={
                "application_endpoint": "/v1/ai/generate-document",
                "system_prompt_length": len(req.system_prompt or ""),
            },
        )
        raise HTTPException(500, f"Ollama local error: {str(e)}")

async def _generate_openai(req: DocumentGenerationRequest) -> DocumentGenerationResponse:
    """Fallback vers OpenAI GPT-4o-mini."""
    if not settings.openai_api_key:
        raise HTTPException(503, "OpenAI API key not configured")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": req.system_prompt},
                        {"role": "user", "content": req.user_prompt},
                    ],
                    "temperature": req.temperature,
                    "max_tokens": req.max_tokens,
                },
            )
            response.raise_for_status()
            data = response.json()

        return DocumentGenerationResponse(
            content=_clean_markdown_fences(data["choices"][0]["message"]["content"]),
            model_used="gpt-4o-mini",
            tokens_used=data.get("usage", {}).get("total_tokens", 0),
            provider="openai",
        )
    except Exception as e:
        logger.error(f"OpenAI generation failed: {str(e)}")
        raise HTTPException(500, f"OpenAI API error: {str(e)}")
