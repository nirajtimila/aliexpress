@echo off
title AliExpress Mobile Coins (iPhone 16 Pro Max Emulation)
echo ========================================================
echo    OPENING EXACT MOBILE ALIEXPRESS COIN SCREEN
echo ========================================================
echo.
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%~dp0chrome_mobile_session" --remote-debugging-port=9222 --user-agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" --window-size=440,956 --window-position=200,40 --app="https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=pc302"
