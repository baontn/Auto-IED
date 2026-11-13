@echo off
rem Option B: this folder is a clone of the repo on the shared drive. Double-click to get the latest version.
cd /d "%~dp0"
git pull
echo.
echo Done. Press any key to close.
pause >nul
