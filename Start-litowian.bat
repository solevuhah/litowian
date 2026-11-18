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
echo Starting HTTPS tunnel and checking that its public address is reachable...
set "CF=cloudflared"
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\cloudflared.exe" set "CF=%LOCALAPPDATA%\Microsoft\WinGet\Links\cloudflared.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$out=Join-Path $env:TEMP 'litowian-cf-out.log'; $err=Join-Path $env:TEMP 'litowian-cf-err.log'; Remove-Item $out,$err -Force -ErrorAction SilentlyContinue; $p=Start-Process -FilePath '%CF%' -ArgumentList @('tunnel','--url','http://localhost:8787') -PassThru -RedirectStandardOutput $out -RedirectStandardError $err; $url=$null; $ready=$false; for($i=0;$i -lt 90 -and -not $ready;$i++){ Start-Sleep -Seconds 1; $txt=(Get-Content $out,$err -Raw -ErrorAction SilentlyContinue) -join ' '; if(-not $url -and $txt -match 'https://[a-z0-9-]+\.trycloudflare\.com'){ $url=$Matches[0]; Write-Host ('Tunnel address received: '+$url) }; if($url){ try { Resolve-DnsName ([uri]$url).Host -ErrorAction Stop | Out-Null; $r=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500){$ready=$true} } catch {} } }; if($ready){ Write-Host ('PUBLIC LINK READY: '+$url); Start-Process $url; Write-Host 'Create your room on this page, then use Share invite.' } else { Write-Host 'The public tunnel did not become reachable within 90 seconds.'; if($url){Write-Host ('Cloudflare assigned: '+$url)}; Write-Host 'Check your internet connection, then close this window and run Start-litowian.bat again.'; Write-Host 'Cloudflare log:'; Get-Content $err -Tail 20 -ErrorAction SilentlyContinue }; Wait-Process -Id $p.Id"
pause
