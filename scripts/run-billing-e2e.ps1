#!/usr/bin/env pwsh
# One-shot billing verification: DB up/init, backend up, test suite, backend shutdown.

$ErrorActionPreference = "Stop"
$backendProcess = $null

function Write-Step {
    param([string]$Text)
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Invoke-Step {
    param(
        [string]$Name,
        [string]$Command
    )

    Write-Step $Name
    Write-Host "$Command" -ForegroundColor DarkGray
    Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

function Wait-ForBackend {
    param(
        [int]$MaxAttempts = 20
    )

    for ($i = 1; $i -le $MaxAttempts; $i++) {
        try {
            Invoke-RestMethod -Uri "http://localhost:404/v1/health" -Method Get | Out-Null
            Write-Host "Backend is healthy." -ForegroundColor Green
            return
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    }

    throw "Backend did not become healthy in time."
}

function Stop-Backend {
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Write-Step "Stopping backend"
        Stop-Process -Id $backendProcess.Id -Force
    }
}

try {
    Invoke-Step -Name "Start PostgreSQL container" -Command "scripts\db-up.cmd"
    Invoke-Step -Name "Initialize database schema" -Command "scripts\db-init.cmd"

    $existingPortOwner = Get-NetTCPConnection -LocalPort 404 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
    if ($existingPortOwner) {
        Write-Step "Clearing existing process on port 404"
        Stop-Process -Id $existingPortOwner -Force
    }

    Write-Step "Starting backend"
    $backendProcess = Start-Process -FilePath "node" -ArgumentList "backend.js" -PassThru -WorkingDirectory $PWD
    Wait-ForBackend

    Invoke-Step -Name "Validate Stripe configuration" -Command "npm run test:stripe:validate"
    Invoke-Step -Name "Run billing integration suite" -Command "npm run test:billing"
    Invoke-Step -Name "Run billing failure-path suite" -Command "npm run test:billing:failure"
    Invoke-Step -Name "Run payment smoke test" -Command "npm run test:payment"
    Invoke-Step -Name "Run DB persistence test" -Command "npm run test:billing:persistence"

    Write-Host "`nAll billing checks completed successfully." -ForegroundColor Green
}
finally {
    Stop-Backend
}
