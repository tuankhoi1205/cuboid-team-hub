@echo off
setlocal
cd /d "%~dp0"
set "HUB_NODE=node"
if exist "%~dp0.runtime\node.exe" set "HUB_NODE=%~dp0.runtime\node.exe"
set "HUB_ROOT=%~dp0"
set "HUB_DATA_DIR=%~dp0data"
if exist "%~dp0.runtime\qc-python\python.exe" set "HUB_QC_PYTHON=%~dp0.runtime\qc-python\python.exe"
if not exist "%~dp0dist\server\server.mjs" goto missingbuild
if exist "%~dp0data\cuboid.sqlite" goto start
"%HUB_NODE%" "%~dp0repo-backup.mjs" restore-new
if errorlevel 1 goto failed
:start
"%HUB_NODE%" "%~dp0launcher.mjs" start --no-tunnel
if errorlevel 1 goto failed
echo.
echo Local Hub is ready. Existing database was kept.
pause
exit /b 0
:missingbuild
echo Build missing. From the repository root run: npm ci
echo Then run: node self-host/build.mjs
:failed
echo.
echo Setup did not complete. Existing data was not overwritten.
pause
exit /b 1
