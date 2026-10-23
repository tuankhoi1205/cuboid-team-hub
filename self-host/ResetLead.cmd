@echo off
cd /d "%~dp0"
if exist "%~dp0.runtime\node.exe" ("%~dp0.runtime\node.exe" "%~dp0admin.mjs" reset-lead) else (node "%~dp0admin.mjs" reset-lead)
echo Open the private link in .runtime\reset-lead-link.txt on this computer. It expires in 30 minutes.
pause
