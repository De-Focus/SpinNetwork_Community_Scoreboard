@echo off
setlocal
cd /d "%~dp0"
set "BBX_OPEN_BROWSER=1"
if exist "%~dp0runtime\node.exe" (
    "%~dp0runtime\node.exe" "%~dp0server.js"
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo Node.js was not found.
        echo Use the Windows Setup.exe distribution for no-dependency installation.
        echo Developers can install Node.js 22+ and rerun this launcher.
        pause
        exit /b 1
    )
    node "%~dp0server.js"
)
if errorlevel 1 (
    echo BBX Community exited with an error.
    pause
)
