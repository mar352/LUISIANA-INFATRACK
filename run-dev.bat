@echo off
setlocal

REM IMPACT-Luisiana one-click dev runner (Windows)
REM - Opens backend + frontend in separate terminals
REM - Runs npm install automatically the first time

cd /d "%~dp0"

echo Starting IMPACT-Luisiana dev servers...
echo.

start "IMPACT Backend (Express + Socket.IO)" cmd /k "cd backend && npm install && npm run dev"
start "IMPACT Frontend (React + Vite)" cmd /k "cd frontend && npm install && npm run dev"

echo.
echo If Vite says the port changed, use the printed URL (e.g. http://localhost:5174/).
echo Backend defaults to http://localhost:4000
echo.
pause

