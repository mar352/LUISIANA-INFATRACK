@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo Creating .env from .env.example ...
  copy /Y ".env.example" ".env" >nul
  echo.
  echo Edit .env and set VITE_MAPBOX_TOKEN=pk.your_token
  echo Then run this script again.
  echo.
  pause
  exit /b 1
)

echo Building and starting INFA-TRACK (Docker)...
echo Open http://localhost:8080 when ready.
echo.

docker compose up --build
pause
