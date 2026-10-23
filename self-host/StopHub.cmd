@echo off
cd /d "%~dp0"
if exist "%~dp0.runtime\node.exe" ("%~dp0.runtime\node.exe" "%~dp0launcher.mjs" stop) else (node "%~dp0launcher.mjs" stop)
pause
