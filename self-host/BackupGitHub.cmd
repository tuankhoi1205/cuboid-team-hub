@echo off
cd /d "%~dp0"
if exist "%~dp0.runtime\node.exe" ("%~dp0.runtime\node.exe" "%~dp0repo-backup.mjs" export) else (node "%~dp0repo-backup.mjs" export)
echo.
echo Encrypted snapshot only. Commit and push it from the repository when ready.
echo Keep .runtime\repo-backup-key.json separately; never upload the key.
pause
