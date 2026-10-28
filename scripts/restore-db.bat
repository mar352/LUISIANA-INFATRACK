@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0\.."

set "BACKUP_DIR=%CD%\backups"
echo =====================================================================
echo  LUISIANA INFA-TRACK - Database Restoration (Docker)
echo =====================================================================

if "%~1"=="" (
    echo.
    echo Available backup files in %BACKUP_DIR%:
    echo.
    dir /b /o:-d "%BACKUP_DIR%\*.sql" 2>nul
    echo.
    set /p "TARGET_FILE=Enter the backup filename to restore (e.g. luisiana_infatrack_20261027_120000.sql): "
    set "RESTORE_PATH=%BACKUP_DIR%\!TARGET_FILE!"
) else (
    set "RESTORE_PATH=%~1"
)

if not exist "!RESTORE_PATH!" (
    echo [ERROR] Backup file "!RESTORE_PATH!" does not exist.
    pause
    exit /b 1
)

echo.
echo Restoring from: !RESTORE_PATH! ...
echo WARNING: This will overwrite tables in the database with the backup data.
set /p "CONFIRM=Are you sure you want to proceed? (Y/N): "
if /i not "!CONFIRM!"=="Y" (
    echo Restoration cancelled.
    pause
    exit /b 0
)

for /f "tokens=*" %%C in ('docker ps -q -f "ancestor=postgis/postgis:16-3.4-alpine"') do (
    docker exec -i %%C psql -U postgres -d luisiana_infatrack < "!RESTORE_PATH!"
    if !errorlevel! equ 0 (
        echo.
        echo [SUCCESS] Database restored successfully from !RESTORE_PATH!.
        pause
        exit /b 0
    )
)

echo.
echo [ERROR] Restoration failed. Make sure the PostgreSQL Docker container is running.
pause
