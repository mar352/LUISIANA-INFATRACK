@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo Creating .env from .env.example ...
  copy /Y ".env.example" ".env" >nul
)

echo Starting INFA-TRACK dev stack with auto-reload...
echo Frontend: http://localhost:5173  ^(Vite HMR^)
echo Backend:  http://localhost:4000  ^(node --watch^)
echo.
echo Uses project name "infatrack-dev" so prod on :8080 can run separately.
echo File changes sync automatically — no manual rebuild needed.
echo Press Ctrl+C to stop.
echo.

docker compose -p infatrack-dev -f docker-compose.dev.yml up --build --watch

pause
