@echo off
chcp 65001 >nul
rem Builds Nova with no internet: libraries come from the npm-cache folder next to this file.
cd /d "%~dp0"
call npm ci --offline --cache "%~dp0npm-cache" --no-audit --no-fund
if errorlevel 1 ( echo Install failed. Is Node.js installed? & pause & exit /b 1 )
call npm run build
if errorlevel 1 ( echo Build failed. & pause & exit /b 1 )
echo.
echo Done. Load the "dist" folder in chrome://extensions (Load unpacked).
pause
