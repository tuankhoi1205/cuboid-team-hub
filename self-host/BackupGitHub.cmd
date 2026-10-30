@echo off
cd /d "%~dp0"
if exist "%~dp0.runtime\node.exe" ("%~dp0.runtime\node.exe" "%~dp0..\scripts\export-plain-data.mjs") else (node "%~dp0..\scripts\export-plain-data.mjs")
if errorlevel 1 goto failed
echo.
echo Plain SQLite and files exported. Commit and push data\plain and data\team-data-release.json.
echo Receiving hosts will back up and replace their DB once after pull, build and restart.
echo This data export needs no decryption key.
pause
exit /b 0
:failed
echo Snapshot export failed. Do not publish a partial data release.
pause
exit /b 1
