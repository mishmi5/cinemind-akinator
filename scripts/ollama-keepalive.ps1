# CineMind — Ollama 24/7 keep-alive + health-check + auto-recovery.
#
# Run periodically (every ~2 min via Task Scheduler). It:
#   1. Checks the local Ollama server is up; if down, starts it (detached).
#   2. Warms the taste model into memory (keep_alive 30m) so the FIRST customer request
#      is fast, and so a crashed/evicted model is reloaded automatically.
#   3. Logs status to scripts\ollama-keepalive.log for quick diagnosis.
#
# Result: the LLM the site depends on stays alive and responsive around the clock with no
# manual intervention. (The deterministic engine still works even if this ever fails —
# the LLM is only used for recommendation reasons — so customers never hit a hard break.)

$ErrorActionPreference = 'SilentlyContinue'
$Model   = $env:OLLAMA_MODEL; if (-not $Model) { $Model = 'qwen2.5:14b-instruct' }
$Base    = 'http://localhost:11434'
$LogFile = Join-Path $PSScriptRoot 'ollama-keepalive.log'
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Out-File -FilePath $LogFile -Append -Encoding utf8 }

function Test-Ollama {
  try { (Invoke-WebRequest -Uri "$Base/api/tags" -TimeoutSec 5 -UseBasicParsing).StatusCode -eq 200 }
  catch { $false }
}

if (-not (Test-Ollama)) {
  Log 'Ollama DOWN — starting `ollama serve`'
  Start-Process -WindowStyle Hidden -FilePath 'ollama' -ArgumentList 'serve'
  for ($i = 0; $i -lt 12 -and -not (Test-Ollama); $i++) { Start-Sleep -Seconds 2 }
  if (Test-Ollama) { Log 'Ollama recovered' } else { Log 'Ollama FAILED to start — check install (ollama in PATH?)'; exit 1 }
}

# Warm / keep the model resident so it always answers fast.
try {
  $body = @{ model = $Model; prompt = 'ok'; stream = $false; keep_alive = '30m' } | ConvertTo-Json -Compress
  $r = Invoke-WebRequest -Uri "$Base/api/generate" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 90 -UseBasicParsing
  if ($r.StatusCode -eq 200) { Log "OK — '$Model' warm & responsive" } else { Log "WARN — warm returned $($r.StatusCode)" }
} catch { Log "WARN — could not warm '$Model': $_" }
