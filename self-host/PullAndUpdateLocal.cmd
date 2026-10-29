@echo off
setlocal
cd /d "%~dp0.."
set "HUB_NODE=node"
if exist "%~dp0.runtime\node.exe" set "HUB_NODE=%~dp0.runtime\node.exe"
git pull --ff-only
if errorlevel 1 goto failed
"%HUB_NODE%" "%~dp0build.mjs"
if errorlevel 1 goto failed
"%HUB_NODE%" "%~dp0launcher.mjs" restart-app --no-tunnel
if errorlevel 1 goto failed
echo Update complete. Previous data is saved in self-host\data\backups.
pause
exit /b 0
:failed
echo Update failed. Check the message above and self-host\.runtime\app.err.log.
pause
exit /b 1
