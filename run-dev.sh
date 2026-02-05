#!/bin/bash

# NOTE: This script requires Docker access. On Linux, you may need to:
# 1. Run with sudo: sudo ./run-dev.sh
# 2. OR add your user to the docker group: sudo usermod -aG docker $USER (requires logout/login)

# Check if sudo is required for docker
if ! docker ps >/dev/null 2>&1; then
  echo "[!] Docker access denied. Attempting to re-run with sudo..."
  exec sudo bash "$0" "$@"
fi

echo "---------------------------------------"
echo "RAG Education Platform - Linux Starter"
echo "---------------------------------------"

#########################################
# 1. Check Docker
#########################################
echo "--- Checking Docker Status ---"

if ! docker info >/dev/null 2>&1; then
  echo "[!] Docker is not running or not accessible."
  echo "Start Docker Desktop first."
  exit 1
fi

echo "[OK] Docker running"


#########################################
# 2. Start Database containers
#########################################
echo "--- Checking Database (PostgreSQL/Redis) ---"

CONTAINER_NAME="rag_db"

if docker ps --filter "name=$CONTAINER_NAME" --filter "status=running" | grep $CONTAINER_NAME >/dev/null; then
  echo "[OK] Database already running"
else
  echo "[>] Starting containers..."
  docker compose up -d
  if [ $? -ne 0 ]; then
    echo "[!] Failed to start containers"
    exit 1
  fi
fi


#########################################
# 3. Start Backend (FastAPI)
#########################################
echo "--- Starting Backend ---"

gnome-terminal -- bash -c "
source backend/venv/bin/activate
uvicorn backend.main:app --reload --reload-dir backend --host 0.0.0.0 --port 8000
exec bash
" 2>/dev/null &


#########################################
# 4. Start Celery worker
#########################################
echo "--- Starting Celery Worker ---"

mkdir -p storage/logs

gnome-terminal -- bash -c "
source backend/venv/bin/activate
celery -A backend.celery_app worker --loglevel=info -P solo --logfile storage/logs/celery.log
exec bash
" 2>/dev/null &


#########################################
# 5. Start Frontend (Next.js)
#########################################
echo "--- Starting Frontend ---"

gnome-terminal -- bash -c "
cd frontend
npm run dev
exec bash
" 2>/dev/null &


#########################################
echo ""
echo "All components starting!"
echo "Frontend:    http://localhost:3000"
echo "Backend API: http://localhost:8000/docs"
echo "Database:    localhost:5300"
echo ""`