@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install LTS from https://nodejs.org/ and run again.
  pause
  exit /b 1
)
if not exist node_modules\ws (
  echo Installing litowian dependencies...
  call npm install
  if errorlevel 1 (echo Dependency installation failed.& pause & exit /b 1)
)
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo Installing Cloudflare Tunnel with winget...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo winget not found. Install cloudflared from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    pause
    exit /b 1
  )
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo Could not install cloudflared. Install it manually from the link above, then rerun this file.
    pause
    exit /b 1
  )
)
echo.
echo Starting litowian server in another window...
start "litowian server" cmd /k "cd /d "%~dp0" && node server.js"
timeout /t 2 /nobreak >nul
echo.
echo Starting secure HTTPS tunnel and waiting for its public link...
set "CF=cloudflared"
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\cloudflared.exe" set "CF=%LOCALAPPDATA%\Microsoft\WinGet\Links\cloudflared.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$out=Join-Path $env:TEMP 'litowian-cf-out.log'; $err=Join-Path $env:TEMP 'litowian-cf-err.log'; Remove-Item $out,$err -Force -ErrorAction SilentlyContinue; $p=Start-Process -FilePath '%CF%' -ArgumentList @('tunnel','--url','http://localhost:8787') -PassThru -RedirectStandardOutput $out -RedirectStandardError $err; $url=$null; for($i=0;$i -lt 60 -and -not $url;$i++){ Start-Sleep -Seconds 1; $txt=(Get-Content $out,$err -Raw -ErrorAction SilentlyContinue) -join ' '; if($txt -match 'https://[a-z0-9-]+\.trycloudflare\.com'){ $url=$Matches[0] } }; if($url){ Write-Host ('PUBLIC LINK: '+$url); Start-Process $url; Write-Host 'The public page has been opened. Create your room there and send the invite link.' } else { Write-Host 'Could not detect the public URL. Check the Cloudflare output/logs.' }; Wait-Process -Id $p.Id"
pause
