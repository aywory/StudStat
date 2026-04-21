@echo off
chcp 65001 >nul
title Local Server
color 0A

echo ========================================
echo    Starting HTTP server on port 8000
echo ========================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found!
    echo Please install Python from python.org
    echo.
    pause
    exit /b 1
)

python --version
echo.

start http://localhost:8000

echo Server is running at: http://localhost:8000
echo.
echo To stop the server, press Ctrl+C
echo.

python -m http.server 8000 --bind 127.0.0.1

pause