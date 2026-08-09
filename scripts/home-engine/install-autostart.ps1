# 부팅(로그온) 시 엔진 자동 시작 — 관리자 PowerShell 권장
# 사용: .\scripts\home-engine\install-autostart.ps1

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$TaskName = 'TossAutoPilot-Engine'
$StartScript = Join-Path $Root 'scripts\home-engine\start-engine.ps1'

if (-not (Test-Path $StartScript)) {
  throw "start-engine.ps1 not found: $StartScript"
}

# pwsh 우선, 없으면 Windows PowerShell 5.1
$PwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
if ($PwshCmd -and $PwshCmd.Source) {
  $PsExe = $PwshCmd.Source
} else {
  $PsExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
}

$Arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`""

$Action = New-ScheduledTaskAction -Execute $PsExe -Argument $Arg -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Days 0) # 무제한

# 기존 제거 후 등록
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description 'TossAutoPilot trading engine (home PC, Toss IP allowlist)' `
  -Force | Out-Null

Write-Host "OK: Scheduled task '$TaskName' registered (At logon)." -ForegroundColor Green
Write-Host "Start now: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Remove:    .\scripts\home-engine\uninstall-autostart.ps1"
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  1) .\scripts\home-engine\show-public-ip.ps1  → 토스 IP 등록"
Write-Host "  2) Vercel ENGINE_URL = 이 PC 공개 URL (터널 등)"
Write-Host "  3) ENGINE_INTERNAL_SECRET 동일"
