@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo Creating .env from .env.example ...
  copy /Y ".env.example" ".env" >nul
)

echo Starting INFA-TRACK dev stack (hot reload)...
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:4000
echo.

docker compose -f docker-compose.dev.yml up --build
pause
