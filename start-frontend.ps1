# Start the TEJAS-CV frontend. Start the backend first (.\start-backend.ps1 in another window).
Set-Location "$PSScriptRoot\frontend"
if (-not (Test-Path "node_modules")) { npm install }
npm run dev
