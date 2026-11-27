@echo off
title AliExpress Daily Coins Auto-Collector
echo ========================================================
echo       ALIEXPRESS DAILY COINS AUTO-COLLECTOR APP
echo                 React + Node.js Engine
echo ========================================================
echo.

:: Ensure any old process on port 3333 is terminated cleanly
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3333 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Starting Server on http://localhost:3333 ...
echo.

:: Open Browser Dashboard
start "" "http://localhost:3333"

:: Run Node.js Full-Stack Server
node server.js

pause
