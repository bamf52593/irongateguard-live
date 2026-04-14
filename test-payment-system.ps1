# IronGate Payment System - Status Report

$BaseUrl = "http://localhost:4000/v1"

Write-Host "IRONGATE PAYMENT SYSTEM - LIVE" -ForegroundColor Green
Write-Host ""

# Test plans
$plans = Invoke-RestMethod -Uri "$BaseUrl/billing/plans" -Method Get
Write-Host "Available Plans:" -ForegroundColor Green
foreach ($plan in $plans.plans) {
    Write-Host "- $($plan.name): $($plan.amount) per month" -ForegroundColor Gray
}
Write-Host ""

# Test login and subscription
$loginResp = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"admin@irongate.local","password":"Admin@123"}'
$token = $loginResp.token
$userId = $loginResp.user.id
$headers = @{ "Authorization" = "Bearer $token" }
$sub = Invoke-RestMethod -Uri "$BaseUrl/billing/subscription" -Method Get -Headers $headers
Write-Host "Subscription Status:" -ForegroundColor Green
Write-Host "Current Plan: $($sub.subscription.planDetails.name)" -ForegroundColor Gray
Write-Host "Status: $($sub.subscription.status)" -ForegroundColor Gray
Write-Host ""

# Test checkout
$checkoutPayload = @{
    userId = $userId
    email = "admin@irongate.local"
    orgName = "IronGate"
    planKey = "starter"
} | ConvertTo-Json

$checkout = Invoke-RestMethod -Uri "$BaseUrl/billing/checkout" -Method Post -ContentType "application/json" -Body $checkoutPayload
Write-Host "Checkout Working: Yes" -ForegroundColor Green
Write-Host "Session Created: $($checkout.sessionId)" -ForegroundColor Gray
Write-Host ""

Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host "1. Get Stripe keys from dashboard.stripe.com"  -ForegroundColor Gray
Write-Host "2. Update .env with keys" -ForegroundColor Gray
Write-Host "3. Visit http://localhost:3000/billing" -ForegroundColor Gray
Write-Host ""
