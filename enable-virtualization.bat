@echo off
:: Self-elevate script to Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

echo =====================================================================
echo  LUISIANA INFA-TRACK - Enabling Windows Virtualization for Docker
echo =====================================================================
echo.
echo [1/2] Enabling Virtual Machine Platform...
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

echo.
echo [2/2] Enabling Windows Subsystem for Linux (WSL)...
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

echo.
echo =====================================================================
echo  [SUCCESS] Virtualization features have been enabled successfully!
echo.
echo  Please save your work and RESTART your computer now.
echo  After restart, Docker Desktop will turn green and run automatically!
echo =====================================================================
echo.
pause
