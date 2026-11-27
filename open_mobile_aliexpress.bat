@echo off
title Launch AliExpress Coins (Mobile Mode)
echo ========================================================
echo       AliExpress Daily Coins Mobile Launcher
echo ========================================================
echo.
echo Launching AliExpress Coins in your logged-in Chrome profile...
echo.

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% (
    set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

start "" %CHROME_PATH% --profile-directory="Profile 1" --window-size=440,956 "https://m.aliexpress.com/p/coin-index/index.html"

echo.
echo Launched!
echo If DevTools isn't open, press F12 and toggle Device Toolbar (Ctrl+Shift+M).
echo If Tampermonkey is installed, the Auto-Collector runs automatically!
echo.
pause
