@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0\.."

set "BACKUP_DIR=%CD%\backups"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

for /f "tokens=*" %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TIMESTAMP=%%I"
if not defined TIMESTAMP set "TIMESTAMP=%DATE:~10,4%%DATE:~4,2%%DATE:~7,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
set "TIMESTAMP=%TIMESTAMP: =0%"
set "BACKUP_FILE=%BACKUP_DIR%\luisiana_infatrack_%TIMESTAMP%.sql"

echo =====================================================================
echo  LUISIANA INFA-TRACK - Automated Database Backup (Docker)
echo  Output: %BACKUP_FILE%
echo =====================================================================

docker exec -t luisiana-infatrack-master-postgres-1 pg_dump -U postgres -d luisiana_infatrack --clean --if-exists > "%BACKUP_FILE%" 2>nul
if errorlevel 1 (
    for /f "tokens=*" %%C in ('docker ps -q -f "ancestor=postgis/postgis:16-3.4-alpine"') do (
        docker exec -t %%C pg_dump -U postgres -d luisiana_infatrack --clean --if-exists > "%BACKUP_FILE%"
    )
)

if exist "%BACKUP_FILE%" (
    for %%A in ("%BACKUP_FILE%") do (
        if %%~zA GTR 0 (
            echo.
            echo [SUCCESS] Backup completed successfully!
            echo File size: %%~zA bytes
            echo Location: %BACKUP_FILE%
            goto :done
        )
    )
)

echo.
echo [ERROR] Backup failed. Make sure the PostgreSQL Docker container is running.
echo Run "run-docker.bat" or "run-docker-dev.bat" first.

:done
echo.
pause
