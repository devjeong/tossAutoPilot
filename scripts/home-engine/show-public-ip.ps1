# 토스 Open API 허용 목록에 넣을 공인 IP
$ErrorActionPreference = 'Stop'
Write-Host "Public IP (register this in Toss Open API console):" -ForegroundColor Cyan
try {
  $ip = (Invoke-RestMethod -Uri 'https://ifconfig.me/ip' -TimeoutSec 10).Trim()
  Write-Host $ip -ForegroundColor Green
} catch {
  Write-Host "ifconfig.me failed, try https://api.ipify.org" -ForegroundColor Yellow
  $ip = (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 10).Trim()
  Write-Host $ip -ForegroundColor Green
}
Write-Host ""
Write-Host "Local engine health (if running): http://127.0.0.1:8787/health"
