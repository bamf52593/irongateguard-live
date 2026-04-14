#!/usr/bin/env pwsh
# IronGate Stripe Payment System - Full Integration Test
# This script tests all billing endpoints

$BaseUrl = "http://localhost:4000/v1"
$testResults = @()

function Add-TestResult {
    param(
        [string]$Name,
        [string]$Status,
        [object]$Response = $null,
        [string]$Error = $null
    )

    $script:testResults += @{
        Name = $Name
        Status = $Status
        Response = $Response
        Error = $Error
    }
}

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Endpoint,
        [object]$Body,
        [hashtable]$Headers = @{}
    )
    
    Write-Host "Testing: $Name..." -ForegroundColor Cyan
    
    try {
        $params = @{
            Uri = "$BaseUrl$Endpoint"
            Method = $Method
            ContentType = "application/json"
            Headers = $Headers
        }
        
        if ($Body) {
            $params['Body'] = $Body | ConvertTo-Json
        }
        
        $response = Invoke-RestMethod @params
        
        Write-Host "[PASS]" -ForegroundColor Green
        Add-TestResult -Name $Name -Status "PASSED" -Response $response
        return $response
    }
    catch {
        Write-Host "[FAIL]: $($_.Exception.Message)" -ForegroundColor Red
        Add-TestResult -Name $Name -Status "FAILED" -Error $_.Exception.Message
        return $null
    }
}

Write-Host "`n============================================================" -ForegroundColor Magenta
Write-Host "  IronGate Stripe Integration - Comprehensive Test Suite" -ForegroundColor Magenta
Write-Host "============================================================`n" -ForegroundColor Magenta

# Test 1: Get Plans
Write-Host "`n[1/6] Testing Plans Endpoint" -ForegroundColor Yellow
$plans = Test-Endpoint -Name "Get Available Plans" -Method "Get" -Endpoint "/billing/plans"

if ($plans) {
    Write-Host "Found $(($plans.plans | Measure-Object).Count) plans:" -ForegroundColor Cyan
    $plans.plans | ForEach-Object {
        Write-Host "  - $($_.name): $($_.amount)/month - $($_.devices) devices, $($_.users) users" -ForegroundColor Gray
    }
}

# Test 2: Get Subscription Status (Free Tier - Without Auth)
Write-Host "`n[2/6] Testing Subscription Status (No Auth - Should Fail)" -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "$BaseUrl/billing/subscription" -Method Get | Out-Null
    Write-Host "[FAIL]: Expected 401 but request succeeded" -ForegroundColor Red
    Add-TestResult -Name "Get Subscription (expecting 401)" -Status "FAILED" -Error "Expected 401 but request succeeded"
}
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Host "[PASS] (received expected 401)" -ForegroundColor Green
        Add-TestResult -Name "Get Subscription (expecting 401)" -Status "PASSED"
    }
    else {
        Write-Host "[FAIL]: Expected 401 but got $statusCode" -ForegroundColor Red
        Add-TestResult -Name "Get Subscription (expecting 401)" -Status "FAILED" -Error "Expected 401 but got $statusCode"
    }
}

# Test 3: Login to get JWT token
Write-Host "`n[3/6] Testing Authentication" -ForegroundColor Yellow
$loginBody = @{
    email = "admin@irongate.local"
    password = "Admin@123"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
if ($loginResponse.token) {
    Write-Host "[PASS] Login successful, JWT token generated" -ForegroundColor Green
    $authToken = $loginResponse.token
    $authUser = $loginResponse.user
    Add-TestResult -Name "Authentication" -Status "PASSED"
    Write-Host "Token: $($authToken.Substring(0, 20))..." -ForegroundColor Gray
}
else {
    Write-Host "[FAIL] Login failed" -ForegroundColor Red
    Add-TestResult -Name "Authentication" -Status "FAILED" -Error "Login failed"
    exit 1
}

# Test 4: Get Subscription Status (With Auth)
Write-Host "`n[4/6] Testing Subscription Status (With Auth)" -ForegroundColor Yellow
$headers = @{ "Authorization" = "Bearer $authToken" }
$subscription = Test-Endpoint -Name "Get Subscription (authenticated)" -Method "Get" -Endpoint "/billing/subscription" -Headers $headers

if ($subscription) {
    Write-Host "Current Status:" -ForegroundColor Cyan
    Write-Host "  Plan: $($subscription.subscription.plan)" -ForegroundColor Gray
    Write-Host "  Status: $($subscription.subscription.status)" -ForegroundColor Gray
    Write-Host "Usage Metrics:" -ForegroundColor Cyan
    Write-Host "  Devices: $($subscription.usage.devices)" -ForegroundColor Gray
    Write-Host "  Users: $($subscription.usage.users)" -ForegroundColor Gray
    Write-Host "  Events (30d): $($subscription.usage.events)" -ForegroundColor Gray
}

# Test 5: Create Checkout Session
Write-Host "`n[5/6] Testing Checkout Session Creation" -ForegroundColor Yellow
$checkoutBody = @{
    userId = $authUser.id
    email = $authUser.email
    orgName = "IronGate"
    planKey = "starter"
}

$checkout = Test-Endpoint -Name "Create Checkout Session" -Method "Post" -Endpoint "/billing/checkout" -Body $checkoutBody

if ($checkout) {
    Write-Host "Checkout URLs generated:" -ForegroundColor Cyan
    Write-Host "  Session ID: $($checkout.sessionId)" -ForegroundColor Gray
    if ($checkout.url) {
        Write-Host "  Checkout URL: $($checkout.url.Substring(0, 50))..." -ForegroundColor Gray
    }
}

# Test 6: Health Check
Write-Host "`n[6/6] Testing Health Endpoint" -ForegroundColor Yellow
Test-Endpoint -Name "Health Check" -Method "Get" -Endpoint "/health" | Out-Null

# Summary
Write-Host "`n============================================================" -ForegroundColor Magenta
Write-Host "  Test Summary" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta

$passCount = ($testResults | Where-Object { $_.Status -eq "PASSED" } | Measure-Object).Count
$failCount = ($testResults | Where-Object { $_.Status -eq "FAILED" } | Measure-Object).Count

Write-Host "`nPassed: $passCount" -ForegroundColor Green
Write-Host "Failed: $failCount" -ForegroundColor Red
Write-Host "`nTotal: $($testResults.Count) tests" -ForegroundColor Cyan

if ($failCount -eq 0) {
    Write-Host "`nAll tests passed. Payment system is operational." -ForegroundColor Green
}
else {
    Write-Host "`nSome tests failed. Check errors above." -ForegroundColor Yellow
}

Write-Host "`n============================================================`n" -ForegroundColor Magenta
