# CineMind — register the Ollama keep-alive as a Windows Scheduled Task.
#
# Runs ollama-keepalive.ps1 at every boot/login AND every 2 minutes, so the model is
# always up. Run this ONCE, from an elevated PowerShell:
#
#   powershell -ExecutionPolicy Bypass -File scripts\install-ollama-keepalive.ps1
#
# Remove later with:  Unregister-ScheduledTask -TaskName 'CineMind-Ollama-Keepalive' -Confirm:$false

$TaskName = 'CineMind-Ollama-Keepalive'
$Script   = Join-Path $PSScriptRoot 'ollama-keepalive.ps1'
if (-not (Test-Path $Script)) { Write-Error "Missing $Script"; exit 1 }

$action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Script`""
$atLogon = New-ScheduledTaskTrigger -AtLogOn
$every2  = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $atLogon, $every2 `
  -Settings $settings -RunLevel Highest -Force | Out-Null
Write-Host "Registered scheduled task '$TaskName' (at logon + every 2 min)." -ForegroundColor Green
Write-Host "Run it now with:  Start-ScheduledTask -TaskName '$TaskName'"
