@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the LTS version from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)
if not exist node_modules\ws (
  echo Installing litowian dependencies...
  call npm install
  if errorlevel 1 (
    echo Could not install dependencies. Check your internet connection.
    pause
    exit /b 1
  )
)
start "" http://localhost:8787
node server.js
pause
