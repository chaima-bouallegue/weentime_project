from fastapi import APIRouter, HTTPException, Form, UploadFile, File
from pydantic import BaseModel, Field
import logging
import json
import io
from pathlib import Path
import pypdf
import httpx
from app.api.document_generation import _generate_gemini, DocumentGenerationRequest
from config import get_settings

router = APIRouter(tags=["Recruitment IA"])
logger = logging.getLogger(__name__)
settings = get_settings()

# URL du rh-service Java (Configurable)
def _get_callback_url() -> str:
    return f"{settings.java_rh_service_url}/api/v1/internal/recruitment"


# ═══════════════════════════════════════════════════
# Modèles — Ancien endpoint (rétrocompatibilité)
# ═══════════════════════════════════════════════════

class CvAnalysisRequest(BaseModel):
    cv_path: str
    job_title: str
    job_description: str


class CvAnalysisResponse(BaseModel):
    overall_score: float
    technical_score: float
    recommendation: str
    summary: str
    strengths: list[str]
    weaknesses: list[str]
    raw_json: str


# ═══════════════════════════════════════════════════
# Modèles — Nouvel endpoint enrichi
# ═══════════════════════════════════════════════════

class EvaluateCvRequest(BaseModel):
    application_id: int
    entreprise_id: int
    cv_file_path: str
    job_title: str
    job_description: str = ""
    competences_requises: list[str] = Field(default_factory=list)
    experience_min_annees: int = 0
    niveau_experience: str = "NON_SPECIFIE"


class EvaluateCvScores(BaseModel):
    score_global: int = Field(ge=0, le=100)
    score_technique: int = Field(ge=0, le=100)
    score_experience: int = Field(ge=0, le=100)
    score_competences: int = Field(ge=0, le=100)
    recommandation: str
    points_forts: list[str] = Field(default_factory=list)
    points_faibles: list[str] = Field(default_factory=list)
    resume_evaluation: str = ""
    competences_trouvees: list[str] = Field(default_factory=list)
    competences_manquantes: list[str] = Field(default_factory=list)
    annees_experience_detectees: int | None = None
    niveau_confiance: int = Field(default=50, ge=0, le=100)


# ═══════════════════════════════════════════════════
# Ancien endpoint (rétrocompatibilité avec hr_tools.py)
# ═══════════════════════════════════════════════════

@router.post("/v1/recrutement/analyze-cv", response_model=CvAnalysisResponse)
async def analyze_cv_endpoint(request: CvAnalysisRequest):
    """
    Endpoint legacy appelé par le rh-service pour analyser un CV.
    Maintenu pour rétrocompatibilité.
    """
    cv_path = Path(request.cv_path)
    if not cv_path.is_absolute():
        cv_path = Path("uploads") / request.cv_path

    if not cv_path.exists():
        logger.error(f"CV file not found: {cv_path}")
        raise HTTPException(status_code=404, detail=f"Fichier CV introuvable: {request.cv_path}")

    try:
        cv_text = _extract_pdf_text(cv_path)
        if not cv_text.strip():
            raise ValueError("Le CV est vide ou illisible.")

        system_prompt = """Tu es un expert RH. Évalue ce CV par rapport à l'offre.
Retourne UNIQUEMENT un JSON valide :
{
  "overall_score": <0-100>,
  "technical_score": <0-100>,
  "recommendation": "highly_recommended|recommended|needs_review|not_recommended",
  "summary": "<synthèse>",
  "strengths": ["point1", "..."],
  "weaknesses": ["point1", "..."]
}"""
        user_prompt = f"POSTE : {request.job_title}\nDESCRIPTION : {request.job_description}\n\nCV :\n{cv_text[:6000]}"

        gen_req = DocumentGenerationRequest(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.1,
            provider="gemini"
        )

        result = await _generate_gemini(gen_req)
        clean_json = result.content.strip().removeprefix("```json").removesuffix("```").strip()
        data = json.loads(clean_json)

        return CvAnalysisResponse(
            overall_score=data.get("overall_score", 0),
            technical_score=data.get("technical_score", 0),
            recommendation=data.get("recommendation", "needs_review"),
            summary=data.get("summary", ""),
            strengths=data.get("strengths", []),
            weaknesses=data.get("weaknesses", []),
            raw_json=clean_json
        )

    except Exception as e:
        logger.error(f"Error in analyze_cv_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur d'analyse IA : {str(e)}")


# ═══════════════════════════════════════════════════
# Nouvel endpoint enrichi avec callback
# ═══════════════════════════════════════════════════

@router.post("/recruitment/evaluate-cv")
async def evaluate_cv_endpoint(
    application_id: int = Form(...),
    entreprise_id: int = Form(...),
    job_title: str = Form(...),
    job_description: str = Form(""),
    competences_requises: str = Form("[]"),
    experience_min_annees: int = Form(0),
    niveau_experience: str = Form("NON_SPECIFIE"),
    file: UploadFile = File(...)
):
    """
    Évaluation IA enrichie d'un CV par rapport à une offre.
    
    1. Extrait le texte du PDF reçu en binaire (UploadFile)
    2. Appelle Gemini avec le prompt structuré (temperature=0.1)
    3. Valide le JSON retourné
    4. Callback avec authentification par secret partagé vers le rh-service Java
    
    Appelé en fire-and-forget par le rh-service Java.
    """
    logger.info(
        "🔍 Évaluation IA démarrée via binaire — Candidature #%s, Entreprise #%s, Poste: %s",
        application_id, entreprise_id, job_title
    )

    # 1. Lire le fichier binaire en mémoire
    try:
        cv_bytes = await file.read()
        if len(cv_bytes) < 50:
            await _send_failure_callback(application_id, entreprise_id, "CV trop court ou illisible")
            return {"status": "error", "detail": "CV trop court ou illisible"}
    except Exception as e:
        logger.error("Erreur lecture fichier CV: %s", str(e))
        await _send_failure_callback(application_id, entreprise_id, f"Erreur lecture CV: {str(e)}")
        return {"status": "error", "detail": str(e)}

    # 2. Extraire le texte du PDF
    try:
        cv_text = _extract_pdf_text_from_bytes(cv_bytes)
        if not cv_text or len(cv_text.strip()) < 50:
            await _send_failure_callback(application_id, entreprise_id, "CV sans texte ou illisible")
            return {"status": "error", "detail": "CV trop court ou illisible"}
    except Exception as e:
        logger.error("Erreur extraction PDF: %s", str(e))
        await _send_failure_callback(application_id, entreprise_id, f"Erreur PDF: {str(e)}")
        return {"status": "error", "detail": str(e)}

    # 3. Parser les compétences requises
    try:
        competences_list = json.loads(competences_requises)
        if not isinstance(competences_list, list):
            competences_list = []
    except Exception:
        competences_list = []

    competences_str = ", ".join(competences_list) if competences_list else "Non spécifiées"

    # 4. Construire le prompt Gemini enrichi
    system_prompt = """Tu es un expert RH senior. Évalue ce candidat pour le poste suivant.

RÈGLES :
- Sois factuel et objectif
- Base ton évaluation uniquement sur le contenu du CV
- Si une information manque dans le CV, indique-le clairement
- Les scores doivent être cohérents entre eux

Retourne UNIQUEMENT ce JSON, sans texte autour :
{
  "score_global": <0-100>,
  "score_technique": <0-100>,
  "score_experience": <0-100>,
  "score_competences": <0-100>,
  "recommandation": "<FORTEMENT_RECOMMANDE|RECOMMANDE|A_EVALUER|REJETE>",
  "points_forts": ["...", "...", "..."],
  "points_faibles": ["...", "..."],
  "resume_evaluation": "<2 phrases factuelles et objectives>",
  "competences_trouvees": ["..."],
  "competences_manquantes": ["..."],
  "annees_experience_detectees": <number ou null>,
  "niveau_confiance": <0-100>
}"""

    user_prompt = f"""POSTE : {job_title}
NIVEAU REQUIS : {niveau_experience}
EXPÉRIENCE MINIMALE : {experience_min_annees} ans
COMPÉTENCES OBLIGATOIRES : {competences_str}
DESCRIPTION : {job_description}

CV DU CANDIDAT :
{cv_text[:8000]}"""

    # 5. Appeler Gemini (temperature=0.1 pour cohérence)
    try:
        gen_req = DocumentGenerationRequest(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.1,
            provider="gemini"
        )

        result = await _generate_gemini(gen_req)

        # Parser et valider le JSON
        raw_content = result.content.strip()
        clean_json = raw_content.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        evaluation = json.loads(clean_json)

        # Valider les scores (clamp entre 0 et 100)
        for score_key in ["score_global", "score_technique", "score_experience", "score_competences", "niveau_confiance"]:
            if score_key in evaluation:
                val = evaluation[score_key]
                if isinstance(val, (int, float)):
                    evaluation[score_key] = max(0, min(100, int(val)))

        # Valider la recommandation
        valid_recs = {"FORTEMENT_RECOMMANDE", "RECOMMANDE", "A_EVALUER", "REJETE"}
        if evaluation.get("recommandation") not in valid_recs:
            evaluation["recommandation"] = "A_EVALUER"

        logger.info(
            "✅ Évaluation Gemini terminée — Candidature #%s, Score: %s/100, Recommandation: %s",
            application_id, evaluation.get("score_global"), evaluation.get("recommandation")
        )

    except json.JSONDecodeError as e:
        logger.error("JSON malformé retourné par Gemini: %s", str(e))
        await _send_failure_callback(application_id, entreprise_id, "Réponse IA malformée")
        return {"status": "error", "detail": "Réponse IA malformée"}
    except Exception as e:
        logger.error("Erreur Gemini: %s", str(e))
        await _send_failure_callback(application_id, entreprise_id, f"Erreur Gemini: {str(e)}")
        return {"status": "error", "detail": str(e)}

    # 6. Callback vers le rh-service Java
    callback_payload = {
        "application_id": application_id,
        "entreprise_id": entreprise_id,
        "scores": evaluation,
        "recommandation": evaluation.get("recommandation", "A_EVALUER")
    }

    try:
        callback_url = f"{_get_callback_url()}/applications/{application_id}/ai-result"
        headers = {
            "X-Internal-Secret": settings.internal_secret
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(callback_url, json=callback_payload, headers=headers)
            if response.status_code == 200:
                logger.info("📡 Callback envoyé avec succès au rh-service pour candidature #%s", application_id)
            else:
                logger.error(
                    "Callback rh-service échoué — Status: %s, Body: %s",
                    response.status_code, response.text
                )
    except Exception as e:
        logger.error("Erreur callback vers rh-service: %s", str(e))

    return {
        "status": "success",
        "application_id": application_id,
        "score_global": evaluation.get("score_global"),
        "recommandation": evaluation.get("recommandation")
    }


# ═══════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════

def _extract_pdf_text_from_bytes(cv_bytes: bytes) -> str:
    """Extrait le texte d'un fichier PDF binaire en mémoire."""
    text = ""
    stream = io.BytesIO(cv_bytes)
    reader = pypdf.PdfReader(stream)
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text.strip()


def _extract_pdf_text(path: Path) -> str:
    """Extrait le texte d'un fichier PDF (Rétrocompatibilité)."""
    text = ""
    with open(path, "rb") as f:
        reader = pypdf.PdfReader(f)
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text.strip()


async def _send_failure_callback(application_id: int, entreprise_id: int, reason: str) -> None:
    """Envoie un callback d'échec au rh-service pour que le statut soit remis à APPLIED."""
    try:
        callback_url = f"{_get_callback_url()}/applications/{application_id}/ai-result"
        payload = {
            "application_id": application_id,
            "entreprise_id": entreprise_id,
            "status": "FAILED",
            "error": reason,
            "scores": {
                "score_global": 0,
                "score_technique": 0,
                "score_experience": 0,
                "score_competences": 0,
                "recommandation": "A_EVALUER",
                "points_forts": [],
                "points_faibles": [],
                "resume_evaluation": "",
                "competences_trouvees": [],
                "competences_manquantes": [],
                "annees_experience_detectees": None,
                "niveau_confiance": 0
            },
            "recommandation": "A_EVALUER"
        }
        headers = {
            "X-Internal-Secret": settings.internal_secret
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(callback_url, json=payload, headers=headers)
        logger.info("Callback d'échec envoyé pour candidature #%s: %s", application_id, reason)
    except Exception as e:
        logger.error("Impossible d'envoyer le callback d'échec: %s", str(e))
