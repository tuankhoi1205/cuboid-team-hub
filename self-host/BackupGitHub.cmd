@echo off
cd /d "%~dp0"
if exist "%~dp0.runtime\node.exe" ("%~dp0.runtime\node.exe" "%~dp0repo-backup.mjs" export) else (node "%~dp0repo-backup.mjs" export)
if errorlevel 1 goto failed
echo.
echo Snapshot and data release created. Commit and push all three files in data\team-*.
echo Receiving hosts will back up and replace their DB once after pull, build and restart.
echo Keep .runtime\repo-backup-key.json separately; never upload the key.
pause
exit /b 0
:failed
echo Snapshot export failed. Do not publish a partial data release.
pause
exit /b 1
