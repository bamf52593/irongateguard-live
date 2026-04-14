#!/usr/bin/env pwsh
# Stops backend/frontend listeners and database container.

$ErrorActionPreference = "Stop"

function Stop-PortListener {
    param([int]$Port)

    $listenerPid = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty OwningProcess

    if ($listenerPid) {
        Write-Host "Stopping listener on port $Port (PID $listenerPid)..." -ForegroundColor Yellow
        Stop-Process -Id $listenerPid -Force
    }
    else {
        Write-Host "No listener found on port $Port." -ForegroundColor DarkGray
    }
}

Stop-PortListener -Port 404
foreach ($port in 3000..3010) {
    Stop-PortListener -Port $port
}

Write-Host "Stopping PostgreSQL container..." -ForegroundColor Cyan
& "$PSScriptRoot\db-down.cmd"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to stop PostgreSQL container."
}

Write-Host "Done." -ForegroundColor Green