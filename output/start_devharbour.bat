@echo off
title Dev Harbour Local Server
echo ========================================================
echo   Launching Dev Harbour Local Server on http://localhost:3000
echo ========================================================
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Opening standalone offline HTML instead...
    start "" "standalone\index.html"
    pause
    exit /b 1
)

echo Starting server daemon...
start "" http://localhost:3000
node server/index.js
pause
