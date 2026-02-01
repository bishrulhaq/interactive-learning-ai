# RAG Education Platform - Local Development Starter

# 1. Check Docker Status
Write-Host "--- Checking Docker Status ---" -ForegroundColor Cyan
$dockerRunning = $false
try {
    $null = docker info --format '{{.ID}}' 2>$null
    if ($LASTEXITCODE -eq 0) {
        $dockerRunning = $true
    }
} catch {
    $dockerRunning = $false
}

if (-not $dockerRunning) {
    Write-Host "[!] Error: Docker Desktop is not running or accessible." -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again." -ForegroundColor Yellow
    exit 1
}

# 2. Start/Check Database
Write-Host "--- Checking Database (PostgreSQL) ---" -ForegroundColor Cyan
$containerName = "rag_db"
$runningIds = docker ps --filter "name=$containerName" --filter "status=running" -q

if ($runningIds) {
    Write-Host "[OK] Database container '$containerName' is already running." -ForegroundColor Green
} else {
    Write-Host "[>] Starting database and redis containers..." -ForegroundColor Yellow
    docker-compose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] Error: Failed to start containers." -ForegroundColor Red
        exit 1
    }
}

# 3. Start Backend (FastAPI) in a new window
Write-Host " "
Write-Host "--- Starting Backend (FastAPI) ---" -ForegroundColor Cyan
# IMPORTANT:
# Limit reload watching to backend-only. If `--reload` watches the whole repo, saving files in `frontend/`
# can trigger backend restarts and cause frequent "Backend Unreachable" in the UI.
$BackendCommand = ".\backend\venv\Scripts\activate; uvicorn backend.main:app --reload --reload-dir backend --host 0.0.0.0 --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$BackendCommand" -WindowStyle Normal

# 4. Start Celery Worker in a new window
Write-Host "--- Starting Celery Worker ---" -ForegroundColor Cyan
# Ensure log directory exists (used by Study → Output panel)
if (-not (Test-Path ".\\storage\\logs")) {
    New-Item -ItemType Directory -Path ".\\storage\\logs" | Out-Null
}

$CeleryCommand = ".\backend\venv\Scripts\activate; celery -A backend.celery_app worker --loglevel=info -P solo --logfile .\\storage\\logs\\celery.log"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$CeleryCommand" -WindowStyle Normal

# 5. Start Frontend (Next.js) in a new window
Write-Host "--- Starting Frontend (Next.js) ---" -ForegroundColor Cyan
$FrontendCommand = "cd frontend; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$FrontendCommand" -WindowStyle Normal

Write-Host " "
Write-Host "All components are starting up!" -ForegroundColor Green
Write-Host "Frontend:    http://localhost:3000"
Write-Host "Backend API: http://localhost:8000/docs"
Write-Host "Database:    localhost:5300"
Write-Host " "
Write-Host "Logs are available in the newly opened terminal windows." -ForegroundColor Gray