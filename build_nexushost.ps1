# build_nexushost.ps1
Write-Host "--- NexusHost Build Master ---" -ForegroundColor Cyan

$root = Get-Location
$dashboardDir = Join-Path $root.Path "nexushost/dashboard"
$engineDir = Join-Path $root.Path "nexushost/engine"

# 1. Build Dashboard
Write-Host "[1/4] Building Dashboard..." -ForegroundColor Yellow
Set-Location $dashboardDir
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Dashboard Build Failed" -ForegroundColor Red; exit $LASTEXITCODE }

# 2. Package Nexus Client (Friend EXE)
Write-Host "[2/4] Packaging Nexus Client (Friend EXE)..." -ForegroundColor Yellow
npm run electron:build
if ($LASTEXITCODE -ne 0) { Write-Host "Client Build Failed" -ForegroundColor Red; exit $LASTEXITCODE }

# 3. Build Engine
Write-Host "[3/4] Building Engine..." -ForegroundColor Yellow
Set-Location $engineDir
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Engine Build Failed" -ForegroundColor Red; exit $LASTEXITCODE }

# 4. Package Nexus Server (Host EXE)
Write-Host "[4/4] Packaging Nexus Server (Host EXE)..." -ForegroundColor Yellow
npm run pkg:build
if ($LASTEXITCODE -ne 0) { Write-Host "Server Build Failed" -ForegroundColor Red; exit $LASTEXITCODE }

Write-Host "--- Build Complete! ---" -ForegroundColor Green
Write-Host "Nexus Server: nexushost/engine/nexus-server.exe"
Write-Host "Nexus Client: nexushost/dashboard/build/Nexus Client Portable.exe"
Set-Location $root
