# 자동 시작 작업 제거
$TaskName = 'TossAutoPilot-Engine'
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Removed scheduled task (if existed): $TaskName" -ForegroundColor Green
