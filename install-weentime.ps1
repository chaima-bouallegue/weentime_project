# ==============================================================================
# WeenTime — Script d'installation et de démarrage automatique ("One-Click Dev")
# ==============================================================================
# Ce script prépare l'environnement et démarre tous les services :
# 1. Copie/Création des fichiers .env et environment.ts manquants
# 2. Démarrage des conteneurs Docker (PostgreSQL 17 on 5433, Redis, MailDev, pgAdmin)
# 3. Préparation des venv Python (ai-service, ml-service) & install dependencies
# 4. Installation des dépendances npm Angular (si nécessaire)
# 5. Démarrage séquentiel des 8 microservices Java Spring Boot
# 6. Démarrage des services Python (ai-service:8000, ml-service:8001)
# 7. Démarrage du frontend Angular (port 4200)
# ==============================================================================

param(
    [switch]$SkipInstall = $false,
    [int]$StartupTimeout = 120
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "🚀 INITIALISATION ET DÉMARRAGE DE LA PLATEFORME WEENTIME" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# ÉTAPE 1 : Vérification & Copie des Fichiers de Configuration (.env, environment.ts)
# ------------------------------------------------------------------------------
Write-Host "`n1️⃣  [CONFIG] Vérification des fichiers de configuration..." -ForegroundColor Yellow

# 1.1 Root .env
$rootEnv = Join-Path $Root ".env"
$rootEnvExample = Join-Path $Root ".env.example"
if (-not (Test-Path $rootEnv) -and (Test-Path $rootEnvExample)) {
    Write-Host "   -> Copie de .env.example vers .env à la racine..." -ForegroundColor Green
    Copy-Item $rootEnvExample $rootEnv
}

# 1.2 Angular environment.ts
$angularEnvDir = Join-Path $Root "weentime-frontend\angular-weentime\src\environments"
$angularEnv = Join-Path $angularEnvDir "environment.ts"
$angularEnvExample = Join-Path $angularEnvDir "environment.example.ts"
if (-not (Test-Path $angularEnv) -and (Test-Path $angularEnvExample)) {
    Write-Host "   -> Copie de environment.example.ts vers environment.ts..." -ForegroundColor Green
    Copy-Item $angularEnvExample $angularEnv
}

# 1.3 ai-service .env
$aiEnv = Join-Path $Root "ai-service\.env"
$aiEnvExample = Join-Path $Root "ai-service\.env.example"
if (-not (Test-Path $aiEnv) -and (Test-Path $aiEnvExample)) {
    Write-Host "   -> Copie de .env.example vers .env dans ai-service..." -ForegroundColor Green
    Copy-Item $aiEnvExample $aiEnv
}

# 1.4 ml-service .env
$mlEnv = Join-Path $Root "ml-service\.env"
$mlEnvExample = Join-Path $Root "ml-service\.env.example"
if (-not (Test-Path $mlEnv) -and (Test-Path $mlEnvExample)) {
    Write-Host "   -> Copie de .env.example vers .env dans ml-service..." -ForegroundColor Green
    Copy-Item $mlEnvExample $mlEnv
}

# Charger les variables du .env racine dans l'environnement du processus
if (Test-Path $rootEnv) {
    Get-Content $rootEnv | Where-Object { $_ -match '=' -and $_ -notmatch '^\s*#' } | ForEach-Object {
        $parts = $_.Trim().Split('=', 2)
        $val = $parts[1].Trim().Trim('"').Trim("'")
        [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $val, [System.EnvironmentVariableTarget]::Process)
    }
}

# ------------------------------------------------------------------------------
# ÉTAPE 2 : Démarrage des conteneurs Docker (PostgreSQL, Redis, MailDev, pgAdmin)
# ------------------------------------------------------------------------------
Write-Host "`n2️⃣  [DOCKER] Démarrage des conteneurs d'infrastructure..." -ForegroundColor Yellow
$dockerComposeFile = Join-Path $Root "weentime-backend\docker-compose.yml"
if (Test-Path $dockerComposeFile) {
    try {
        docker compose -f $dockerComposeFile up -d
        Write-Host "   -> Conteneurs Docker démarrés avec succès (PostgreSQL 5433, Redis 6380, MailDev 1082, pgAdmin 5052)." -ForegroundColor Green
    } catch {
        Write-Warning "   ⚠️  Impossible d'exécuter 'docker compose'. Assurez-vous que Docker Desktop tourne sous Windows/WSL2."
    }
} else {
    Write-Warning "   ⚠️  Fichier docker-compose.yml introuvable dans weentime-backend."
}

# ------------------------------------------------------------------------------
# ÉTAPE 3 : Préparation des environnements virtuels Python (si -SkipInstall n'est pas activé)
# ------------------------------------------------------------------------------
if (-not $SkipInstall) {
    Write-Host "`n3️⃣  [PYTHON] Vérification et préparation des environnements virtuels..." -ForegroundColor Yellow

    # AI Service
    $aiDir = Join-Path $Root "ai-service"
    $aiVenv = Join-Path $aiDir "venv"
    if (Test-Path $aiDir) {
        if (-not (Test-Path $aiVenv)) {
            Write-Host "   -> Création du venv Python 3.11 pour ai-service..." -ForegroundColor Green
            Start-Process -FilePath "py" -ArgumentList "-3.11 -m venv $aiVenv" -WorkingDirectory $aiDir -Wait -NoNewWindow
        }
        $aiPip = Join-Path $aiVenv "Scripts\pip.exe"
        if (Test-Path $aiPip) {
            Write-Host "   -> Installation des dépendances dans ai-service/venv..." -ForegroundColor Green
            Start-Process -FilePath $aiPip -ArgumentList "install -r requirements.txt" -WorkingDirectory $aiDir -Wait -NoNewWindow
        }
    }

    # ML Service
    $mlDir = Join-Path $Root "ml-service"
    $mlVenv = Join-Path $mlDir ".venv"
    if (Test-Path $mlDir) {
        if (-not (Test-Path $mlVenv)) {
            Write-Host "   -> Création du venv Python 3.11 pour ml-service..." -ForegroundColor Green
            Start-Process -FilePath "py" -ArgumentList "-3.11 -m venv $mlVenv" -WorkingDirectory $mlDir -Wait -NoNewWindow
        }
        $mlPip = Join-Path $mlVenv "Scripts\pip.exe"
        if (Test-Path $mlPip) {
            Write-Host "   -> Installation des dépendances dans ml-service/.venv..." -ForegroundColor Green
            Start-Process -FilePath $mlPip -ArgumentList "install -r requirements.txt" -WorkingDirectory $mlDir -Wait -NoNewWindow
        }
    }

    # --------------------------------------------------------------------------
    # ÉTAPE 4 : Installation npm Frontend Angular
    # --------------------------------------------------------------------------
    Write-Host "`n4️⃣  [ANGULAR] Vérification des dépendances npm..." -ForegroundColor Yellow
    $angularDir = Join-Path $Root "weentime-frontend\angular-weentime"
    $nodeModules = Join-Path $angularDir "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Host "   -> Installation des dépendances npm dans angular-weentime..." -ForegroundColor Green
        Start-Process -FilePath "npm.cmd" -ArgumentList "install" -WorkingDirectory $angularDir -Wait -NoNewWindow
    } else {
        Write-Host "   -> node_modules déjà présent." -ForegroundColor Green
    }
}

# ------------------------------------------------------------------------------
# ÉTAPE 5 : Démarrage des Microservices Java Spring Boot
# ------------------------------------------------------------------------------
Write-Host "`n5️⃣  [JAVA] Démarrage des 8 microservices Spring Boot..." -ForegroundColor Yellow

$ServicesRoot = Join-Path $Root "weentime-backend\services"
$JavaServices = @(
    @{ Name = "config-server";        Port = 8988; Path = Join-Path $ServicesRoot "config-server" },
    @{ Name = "discovery-service";    Port = 8861; Path = Join-Path $ServicesRoot "discovery" },
    @{ Name = "auth-service";         Port = 8181; Path = Join-Path $ServicesRoot "auth-service" },
    @{ Name = "organisation-service"; Port = 8190; Path = Join-Path $ServicesRoot "organisation-service" },
    @{ Name = "rh-service";           Port = 8192; Path = Join-Path $ServicesRoot "rh-service" },
    @{ Name = "presence-service";     Port = 8193; Path = Join-Path $ServicesRoot "presence-service" },
    @{ Name = "communication-service";Port = 8194; Path = Join-Path $ServicesRoot "communication-service" },
    @{ Name = "gateway";              Port = 8222; Path = Join-Path $ServicesRoot "gateway" }
)

function Test-PortListening {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    return $null -ne $conn
}

function Wait-Port {
    param([string]$Name, [int]$Port, [int]$TimeoutSeconds)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortListening -Port $Port) {
            Write-Host "   ✅ [$Name] est à l'écoute sur le port $Port" -ForegroundColor Green
            return
        }
        Start-Sleep -Seconds 2
    }
    Write-Warning "   ⚠️ [$Name] n'a pas ouvert le port $Port après $TimeoutSeconds secondes."
}

foreach ($svc in $JavaServices) {
    $name = $svc.Name
    $port = [int]$svc.Port
    $path = $svc.Path
    $mvnw = Join-Path $path "mvnw.cmd"

    if (-not (Test-Path $path)) { continue }

    if (Test-PortListening -Port $port) {
        Write-Host "   ℹ️  [$name] tourne déjà sur le port $port" -ForegroundColor Gray
        continue
    }

    Write-Host "   🚀 Démarrage de $name (Port $port)..." -ForegroundColor Cyan
    Start-Process `
        -FilePath $mvnw `
        -ArgumentList "spring-boot:run" `
        -WorkingDirectory $path `
        -RedirectStandardOutput (Join-Path $path "startup.out.log") `
        -RedirectStandardError (Join-Path $path "startup.err.log") `
        -WindowStyle Hidden

    Wait-Port -Name $name -Port $port -TimeoutSeconds $StartupTimeout
}

# ------------------------------------------------------------------------------
# ÉTAPE 6 : Démarrage des Services Python (AI & ML)
# ------------------------------------------------------------------------------
Write-Host "`n6️⃣  [PYTHON] Démarrage des services AI (8000) et ML (8001)..." -ForegroundColor Yellow

# AI Service (Port 8000)
$aiDir = Join-Path $Root "ai-service"
$aiPython = Join-Path $aiDir "venv\Scripts\python.exe"
if (Test-Path $aiPython) {
    if (-not (Test-PortListening -Port 8000)) {
        Write-Host "   🚀 Démarrage du AI Service (Port 8000)..." -ForegroundColor Cyan
        Start-Process `
            -FilePath $aiPython `
            -ArgumentList "-m uvicorn main:app --host 0.0.0.0 --port 8000 --reload" `
            -WorkingDirectory $aiDir `
            -WindowStyle Minimized
        Wait-Port -Name "ai-service" -Port 8000 -TimeoutSeconds 30
    } else {
        Write-Host "   ℹ️  [ai-service] tourne déjà sur le port 8000" -ForegroundColor Gray
    }
}

# ML Service (Port 8001)
$mlDir = Join-Path $Root "ml-service"
$mlPython = Join-Path $mlDir ".venv\Scripts\python.exe"
if (Test-Path $mlPython) {
    if (-not (Test-PortListening -Port 8001)) {
        Write-Host "   🚀 Démarrage du ML Service (Port 8001)..." -ForegroundColor Cyan
        Start-Process `
            -FilePath $mlPython `
            -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload" `
            -WorkingDirectory $mlDir `
            -WindowStyle Minimized
        Wait-Port -Name "ml-service" -Port 8001 -TimeoutSeconds 30
    } else {
        Write-Host "   ℹ️  [ml-service] tourne déjà sur le port 8001" -ForegroundColor Gray
    }
}

# ------------------------------------------------------------------------------
# ÉTAPE 7 : Démarrage du Frontend Angular
# ------------------------------------------------------------------------------
Write-Host "`n7️⃣  [ANGULAR] Démarrage du frontend (Port 4200)..." -ForegroundColor Yellow
$angularDir = Join-Path $Root "weentime-frontend\angular-weentime"
if (Test-Path $angularDir) {
    if (-not (Test-PortListening -Port 4200)) {
        Write-Host "   🚀 Lancement de 'npm start' pour Angular..." -ForegroundColor Cyan
        Start-Process `
            -FilePath "npm.cmd" `
            -ArgumentList "start" `
            -WorkingDirectory $angularDir
        Write-Host "   ✅ Frontend Angular en cours de démarrage sur http://localhost:4200" -ForegroundColor Green
    } else {
        Write-Host "   ℹ️  [angular-weentime] tourne déjà sur le port 4200" -ForegroundColor Gray
    }
}

Write-Host "`n==================================================================" -ForegroundColor Green
Write-Host "🎉 TOUS LES SERVICES WEENTIME SONT EN COURS D'EXÉCUTION !" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
Write-Host "  • Frontend Angular       : http://localhost:4200" -ForegroundColor Cyan
Write-Host "  • API Gateway Swagger    : http://localhost:8222/swagger-ui.html" -ForegroundColor Cyan
Write-Host "  • Eureka Dashboard       : http://localhost:8861" -ForegroundColor Cyan
Write-Host "  • AI Service Docs (v2)   : http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  • ML Service Docs        : http://localhost:8001/docs" -ForegroundColor Cyan
Write-Host "  • MailDev (Webmail)      : http://localhost:1082" -ForegroundColor Cyan
Write-Host "  • pgAdmin                : http://localhost:5052" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Green
