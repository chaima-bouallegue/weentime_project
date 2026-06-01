# Script de démarrage PowerShell pour WeenTime AI-service (FastAPI)
# Optimisé pour machine 8 GB RAM, CPU-only et Ollama local.

# 1. Configuration JWT
$env:JWT_SECRET="404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970"
$env:AI_JWT_SECRET="404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970"
$env:JWT_VERIFICATION_SECRET="404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970"
$env:AI_JWT_VERIFICATION_SECRET="404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970"
$env:JWT_ALGORITHM="HS256"
$env:AI_JWT_ALLOW_UNVERIFIED="false"

# 2. Configuration Ollama (Local CPU)
$env:AI_PROVIDER_MODE="ollama"
$env:OLLAMA_BASE_URL="http://localhost:11434"
$env:OLLAMA_MODEL="qwen2.5:3b"
$env:OLLAMA_CODER_MODEL="qwen2.5-coder:3b-instruct"
$env:OLLAMA_FALLBACK_MODEL="qwen2.5:3b"
$env:OLLAMA_TIMEOUT_SECONDS="120"
$env:OLLAMA_MAX_TOKENS="1024"
$env:OLLAMA_TEMPERATURE="0.3"
$env:AI_LOCAL_DEVICE="cpu"

# 3. Configuration ChromaDB + RAG
$env:CHROMA_ENABLED="true"
$env:RAG_PROVIDER="chromadb"
$env:CHROMA_COLLECTION_NAME="weentime_policy"
$env:CHROMA_PERSIST_DIR="./storage/chroma"
$env:CHROMA_EMBEDDING_MODEL="nomic-embed-text"
$env:CHROMA_TOP_K="5"
$env:RAG_REQUIRE_CITATIONS="true"
$env:RAG_TENANT_FILTER_REQUIRED="true"

# 4. Configuration Braintrust (Désactivé pour économiser la RAM)
$env:BRAINTRUST_ENABLED="false"

# 5. Configuration Mode Dev & Services
$env:APP_ENV="development"
$env:LOG_LEVEL="INFO"
$env:PORT="8000"
$env:CHATBOT_PUBLIC_MODE="true"
$env:DEFAULT_AI_PROVIDER="gemini"
$env:GEMINI_API_KEY="AIzaSyAUdy7t4B9H2BW-sVtNr-qKc5YvqUs4GDk"
$env:JAVA_RH_SERVICE_URL="http://localhost:8192"
$env:INTERNAL_SECRET="WeenTimeInternalSecretKey2026"

# 6. Démarrage de l'application via l'environnement virtuel local
Write-Host "🚀 Démarrage du WeenTime AI-service sur le port 8000..." -ForegroundColor Green
Write-Host "⚙️ Configuration : Ollama (qwen2.5:3b) + ChromaDB (nomic-embed-text) sur CPU." -ForegroundColor Cyan

if (Test-Path ".\venv") {
    .\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
} else {
    Write-Warning "Environnement virtuel local .\venv introuvable. Tentative de démarrage avec le python système..."
    python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
}
