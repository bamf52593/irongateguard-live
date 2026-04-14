#!/usr/bin/env pwsh
# Overnight keep-alive watchdog for local dev and pre-launch soak testing.
# Starts DB, backend, and frontend, then auto-recovers services if they fail.

param(
    [int]$IntervalSeconds = 30,
    [int]$MaxConsecutiveFailures = 3,
    [switch]$IncludeSentinel
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path "$PSScriptRoot\.."
$logDir = Join-Path $projectRoot "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = Join-Path $logDir ("overnight-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")

    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    $line | Tee-Object -FilePath $logFile -Append
}

function Stop-PortListener {
    param([int]$Port)

    $listenerPid = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty OwningProcess

    if ($listenerPid) {
        Write-Log "Clearing existing listener on port $Port (PID $listenerPid)." "WARN"
        Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
    }
}

function Get-FrontendPort {
    $envFile = Join-Path $projectRoot ".env"
    if (Test-Path $envFile) {
        $line = Select-String -Path $envFile -Pattern "^FRONTEND_PORT=" -SimpleMatch:$false -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($line) {
            $parts = $line.Line -split "=", 2
            $portValue = 0
            if ($parts.Count -eq 2 -and [int]::TryParse($parts[1], [ref]$portValue)) {
                return $portValue
            }
        }
    }
    return 3000
}

function Test-HealthUrl {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 6 -UseBasicParsing
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

function Start-WatchService {
    param(
        [string]$Name,
        [string]$Command,
        [int[]]$Ports,
        [string]$HealthUrl
    )

    foreach ($port in $Ports) {
        Stop-PortListener -Port $port
    }

    Write-Log "Starting $Name using command: $Command"
    $proc = Start-Process powershell -PassThru -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", "Set-Location '$projectRoot'; $Command"
    )

    return [PSCustomObject]@{
        Name = $Name
        Command = $Command
        Ports = $Ports
        HealthUrl = $HealthUrl
        ProcessId = $proc.Id
        Failures = 0
        LastHealthyAt = $null
    }
}

function Restart-WatchService {
    param([pscustomobject]$Service)

    Write-Log "Restarting $($Service.Name)..." "WARN"

    if ($Service.ProcessId) {
        Stop-Process -Id $Service.ProcessId -Force -ErrorAction SilentlyContinue
    }

    foreach ($port in $Service.Ports) {
        Stop-PortListener -Port $port
    }

    $new = Start-WatchService -Name $Service.Name -Command $Service.Command -Ports $Service.Ports -HealthUrl $Service.HealthUrl
    $Service.ProcessId = $new.ProcessId
    $Service.Failures = 0
    $Service.LastHealthyAt = $null
}

Write-Log "Overnight guard starting. Logs: $logFile"
Write-Log "IntervalSeconds=$IntervalSeconds MaxConsecutiveFailures=$MaxConsecutiveFailures IncludeSentinel=$IncludeSentinel"

Write-Log "Starting PostgreSQL container..."
& "$PSScriptRoot\db-up.cmd"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to start PostgreSQL container."
}

$frontendPort = Get-FrontendPort
$services = @()
$services += Start-WatchService -Name "backend" -Command "npm run backend" -Ports @(4000) -HealthUrl "http://localhost:4000/health"
$services += Start-WatchService -Name "frontend" -Command "npm run dev" -Ports @($frontendPort) -HealthUrl ("http://localhost:{0}/" -f $frontendPort)

if ($IncludeSentinel) {
    $services += Start-WatchService -Name "sentinel" -Command "npm run sentinel" -Ports @() -HealthUrl ""
}

Write-Log "Initial startup wait (20s) before monitoring loop."
Start-Sleep -Seconds 20

while ($true) {
    foreach ($svc in $services) {
        $procAlive = $false
        if ($svc.ProcessId) {
            $procAlive = $null -ne (Get-Process -Id $svc.ProcessId -ErrorAction SilentlyContinue)
        }

        if (-not $procAlive) {
            Write-Log "$($svc.Name) process is not running." "WARN"
            Restart-WatchService -Service $svc
            continue
        }

        if ([string]::IsNullOrWhiteSpace($svc.HealthUrl)) {
            continue
        }

        $healthy = Test-HealthUrl -Url $svc.HealthUrl
        if ($healthy) {
            if ($svc.Failures -gt 0) {
                Write-Log "$($svc.Name) recovered and is healthy again."
            }
            $svc.Failures = 0
            $svc.LastHealthyAt = Get-Date
        }
        else {
            $svc.Failures++
            Write-Log "$($svc.Name) health check failed ($($svc.Failures)/$MaxConsecutiveFailures). URL=$($svc.HealthUrl)" "WARN"

            if ($svc.Failures -ge $MaxConsecutiveFailures) {
                Restart-WatchService -Service $svc
            }
        }
    }

    Start-Sleep -Seconds $IntervalSeconds
}
