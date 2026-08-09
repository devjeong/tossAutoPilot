# TossAutoPilot — 상시 PC 엔진 기동
# 사용: .\scripts\home-engine\start-engine.ps1

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $Root

Write-Host "== TossAutoPilot Home Engine ==" -ForegroundColor Cyan
Write-Host "Root: $Root"

if (-not (Test-Path (Join-Path $Root '.env'))) {
  Write-Host "WARN: .env 없음. 루트에 .env 를 두세요." -ForegroundColor Yellow
}

# packages 빌드 (최초/변경 후)
if (-not (Test-Path (Join-Path $Root 'packages\core\dist\index.js'))) {
  Write-Host "Building packages..." -ForegroundColor Yellow
  pnpm build:packages
}

Write-Host "Building engine..." -ForegroundColor Yellow
pnpm --filter @tosspilot/engine build

Write-Host "Starting engine (Ctrl+C to stop)..." -ForegroundColor Green
Write-Host "Health: http://127.0.0.1:8787/health"
pnpm --filter @tosspilot/engine start
