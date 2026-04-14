#!/usr/bin/env pwsh
# Verifies billing customer persistence in PostgreSQL across backend restarts.

$BaseUrl = "http://localhost:404/v1"
$DbUrl = $env:DATABASE_URL

if (-not $DbUrl -and (Test-Path ".env")) {
    $dbLine = Get-Content ".env" | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
    if ($dbLine) {
        $DbUrl = $dbLine.Substring('DATABASE_URL='.Length).Trim()
    }
}

if (-not $DbUrl) {
    Write-Host "[FAIL] DATABASE_URL is not set in shell or .env." -ForegroundColor Red
    exit 1
}

try {
    & "C:\Program Files\Docker\Docker\resources\bin\docker.exe" info | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[FAIL] Docker is installed but daemon is not running. Start Docker Desktop first." -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "[FAIL] Docker is not available. Start Docker Desktop first." -ForegroundColor Red
    exit 1
}

function Get-CustomerCount {
    param([string]$UserId)

    $sql = "SELECT COUNT(*) FROM billing_customers WHERE user_id::text = '$UserId';"
    $value = & "C:\Program Files\Docker\Docker\resources\bin\docker.exe" exec -i irongate-postgres psql -U postgres -d irongate -t -A -c $sql
    if ($LASTEXITCODE -ne 0) {
        throw "Could not query billing_customers table. Verify container and schema initialization."
    }
    return [int]($value.Trim())
}

Write-Host "Starting DB persistence test..." -ForegroundColor Cyan

$loginBody = @{ email = "admin@irongate.local"; password = "Admin@123" } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method Post -ContentType "application/json" -Body $loginBody

if (-not $login.token) {
    Write-Host "[FAIL] Login failed." -ForegroundColor Red
    exit 1
}

$userId = $login.user.id
$beforeCount = Get-CustomerCount -UserId $userId
Write-Host "Customers before checkout: $beforeCount" -ForegroundColor Gray

$checkoutBody = @{
    userId = $userId
    email = $login.user.email
    orgName = "IronGate"
    planKey = "starter"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$BaseUrl/billing/checkout" -Method Post -ContentType "application/json" -Body $checkoutBody | Out-Null

$afterCheckoutCount = Get-CustomerCount -UserId $userId
Write-Host "Customers after checkout: $afterCheckoutCount" -ForegroundColor Gray

if ($afterCheckoutCount -lt 1) {
    Write-Host "[FAIL] Expected at least one billing customer row after checkout." -ForegroundColor Red
    exit 1
}

Write-Host "[PASS] Billing customer row is persisted in PostgreSQL." -ForegroundColor Green
