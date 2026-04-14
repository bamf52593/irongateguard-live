#!/usr/bin/env pwsh
# Billing failure-path tests for expected negative scenarios.

$BaseUrl = "http://localhost:404/v1"
$results = @()

function Add-Result {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Detail = ""
    )

    $script:results += @{
        Name = $Name
        Status = $Status
        Detail = $Detail
    }
}

function Expect-ErrorCode {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Endpoint,
        [int]$ExpectedStatus,
        [object]$Body = $null,
        [hashtable]$Headers = @{}
    )

    Write-Host "Testing: $Name" -ForegroundColor Cyan

    try {
        $params = @{
            Uri = "$BaseUrl$Endpoint"
            Method = $Method
            Headers = $Headers
            ErrorAction = "Stop"
        }

        if ($Body -ne $null) {
            $params["ContentType"] = "application/json"
            $params["Body"] = $Body | ConvertTo-Json -Depth 5
        }

        Invoke-RestMethod @params | Out-Null
        Write-Host "[FAIL] Expected HTTP $ExpectedStatus but request succeeded" -ForegroundColor Red
        Add-Result -Name $Name -Status "FAILED" -Detail "Expected HTTP $ExpectedStatus but request succeeded"
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq $ExpectedStatus) {
            Write-Host "[PASS] Received expected HTTP $ExpectedStatus" -ForegroundColor Green
            Add-Result -Name $Name -Status "PASSED" -Detail "HTTP $ExpectedStatus"
        }
        else {
            Write-Host "[FAIL] Expected HTTP $ExpectedStatus but got $statusCode" -ForegroundColor Red
            Add-Result -Name $Name -Status "FAILED" -Detail "Expected $ExpectedStatus, got $statusCode"
        }
    }
}

Write-Host "`n============================================================" -ForegroundColor Magenta
Write-Host "  IronGate Billing Failure-Path Tests" -ForegroundColor Magenta
Write-Host "============================================================`n" -ForegroundColor Magenta

# Baseline status for conditional checks
$status = Invoke-RestMethod -Uri "$BaseUrl/billing/status" -Method Get

Expect-ErrorCode -Name "Subscription without token returns 401" -Method "Get" -Endpoint "/billing/subscription" -ExpectedStatus 401

Expect-ErrorCode -Name "Checkout missing required fields returns 400" -Method "Post" -Endpoint "/billing/checkout" -ExpectedStatus 400 -Body @{ email = "admin@irongate.local" }

Expect-ErrorCode -Name "Webhook missing signature returns 400" -Method "Post" -Endpoint "/billing/webhook" -ExpectedStatus 400 -Body @{ id = "evt_test"; type = "invoice.payment_succeeded" }

$fakeSignatureHeaders = @{ "stripe-signature" = "t=1700000000,v1=invalid_signature" }
Expect-ErrorCode -Name "Webhook invalid signature returns 400" -Method "Post" -Endpoint "/billing/webhook" -ExpectedStatus 400 -Body @{ id = "evt_test"; type = "invoice.payment_succeeded" } -Headers $fakeSignatureHeaders

if (-not $status.stripeConfigured) {
    Expect-ErrorCode -Name "Checkout when Stripe is unconfigured returns 503" -Method "Post" -Endpoint "/billing/checkout" -ExpectedStatus 503 -Body @{ userId = "00000000-0000-0000-0000-000000000000"; email = "admin@irongate.local"; planKey = "starter" }
}
else {
    Write-Host "Testing: Checkout when Stripe is unconfigured returns 503" -ForegroundColor Cyan
    Write-Host "[SKIP] Stripe is configured in this environment" -ForegroundColor Yellow
    Add-Result -Name "Checkout when Stripe is unconfigured returns 503" -Status "SKIPPED" -Detail "Stripe configured"
}

Write-Host "`n============================================================" -ForegroundColor Magenta
Write-Host "  Test Summary" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta

$passCount = ($results | Where-Object { $_.Status -eq "PASSED" } | Measure-Object).Count
$failCount = ($results | Where-Object { $_.Status -eq "FAILED" } | Measure-Object).Count
$skipCount = ($results | Where-Object { $_.Status -eq "SKIPPED" } | Measure-Object).Count

Write-Host "`nPassed: $passCount" -ForegroundColor Green
Write-Host "Failed: $failCount" -ForegroundColor Red
Write-Host "Skipped: $skipCount" -ForegroundColor Yellow
Write-Host "Total: $($results.Count) checks" -ForegroundColor Cyan

if ($failCount -gt 0) {
    exit 1
}
