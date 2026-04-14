#!/usr/bin/env pwsh
# Starts DB, backend API, and frontend dev server in separate terminals.

$ErrorActionPreference = "Stop"

function Stop-PortListener {
    param([int]$Port)

    $listenerPid = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty OwningProcess

    if ($listenerPid) {
        Write-Host "Clearing existing listener on port $Port (PID $listenerPid)..." -ForegroundColor Yellow
        Stop-Process -Id $listenerPid -Force
    }
}

Write-Host "Starting PostgreSQL container..." -ForegroundColor Cyan
& "$PSScriptRoot\db-up.cmd"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to start PostgreSQL container."
}

$projectRoot = Resolve-Path "$PSScriptRoot\.."

Stop-PortListener -Port 404
foreach ($port in 3000..3010) {
    Stop-PortListener -Port $port
}

Write-Host "Launching backend terminal..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", "Set-Location '$projectRoot'; npm run backend"
)

Write-Host "Launching frontend terminal..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", "Set-Location '$projectRoot'; npm run dev"
)

Write-Host "Done. Backend and frontend are starting in separate windows." -ForegroundColor Green