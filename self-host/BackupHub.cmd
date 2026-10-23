@echo off
cd /d "%~dp0"
if exist "%~dp0.runtime\node.exe" ("%~dp0.runtime\node.exe" "%~dp0admin.mjs" backup) else (node "%~dp0admin.mjs" backup)
pause
