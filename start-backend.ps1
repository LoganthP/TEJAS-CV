# Start the TEJAS-CV backend (Windows PowerShell). Run from the tejas-cv folder:  .\start-backend.ps1
#   -Dev     auto-reload while editing Python code (watches only app\, never data\)
#   -NoAuth  TEMPORARY: disable login enforcement (only until the frontend login screen exists)
param([switch]$Dev, [switch]$NoAuth)
Set-Location "$PSScriptRoot\backend"
if (-not (Test-Path ".venv")) {
    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
}
if ($NoAuth) { $env:TEJAS_AUTH_REQUIRED = "0"; Write-Warning "Authentication is OFF. Do not demo like this." }
else { Remove-Item Env:TEJAS_AUTH_REQUIRED -ErrorAction SilentlyContinue }
$args = @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000")
if ($Dev) { $args += @("--reload", "--reload-dir", "app") }
.\.venv\Scripts\python.exe @args
