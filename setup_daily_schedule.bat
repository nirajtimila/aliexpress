@echo off
title Setup 24h Daily Schedule
cd /d "%~dp0"
echo Setting up AliExpress Daily Coins Auto-Collector in Windows Task Scheduler...
echo It will run automatically every day at 9:00 AM in the background.
echo.

schtasks /create /tn "AliExpress_Daily_Coins" /tr "\"%~dp0collect.bat\"" /sc daily /st 09:00 /f

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo [✓] SUCCESS! Daily Auto-Collector is scheduled!
    echo It will automatically collect your coins every day at 9:00 AM.
    echo ========================================================
) else (
    echo [!] Failed to create scheduled task. Please run this as Administrator.
)

pause
