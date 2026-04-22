# Migration Check Script for GSM Converter
# Collects information about current server state before migration

$ErrorActionPreference = "Continue"
$OutputFile = "current_server_info.txt"

function Write-Section {
    param([string]$Title)
    $line = "=" * 70
    "`n$line`n  $Title`n$line`n"
}

# Start report
$report = @()
$report += Write-Section "CURRENT SERVER INFORMATION"
$report += "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$report += "Computer: $env:COMPUTERNAME"
$report += "User: $env:USERNAME"
$report += ""

# System information
$report += Write-Section "SYSTEM"
$os = Get-CimInstance Win32_OperatingSystem
$report += "OS: $($os.Caption)"
$report += "Version: $($os.Version)"
$report += "Architecture: $($os.OSArchitecture)"
$report += ""

# Docker information
$report += Write-Section "DOCKER"
try {
    $dockerVersion = docker --version 2>&1
    $report += "Docker: $dockerVersion"
    
    $composeVersion = docker-compose --version 2>&1
    $report += "Docker Compose: $composeVersion"
    $report += ""
    
    $report += "Running GSM containers:"
    $containers = docker ps --filter "name=gsm" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>&1
    $report += $containers
    $report += ""
    
    $report += "Docker volumes:"
    $volumes = docker volume ls --filter "name=gsm" 2>&1
    $report += $volumes
} catch {
    $report += "Docker not installed or not running"
}
$report += ""

# Database
$report += Write-Section "DATABASE"
try {
    $dbInfo = docker exec gsm_db psql -U gsm_user -d gsm_db -c "\l" 2>&1
    $report += "Database information:"
    $report += $dbInfo
    $report += ""
    
    $tables = docker exec gsm_db psql -U gsm_user -d gsm_db -c "\dt" 2>&1
    $report += "Tables:"
    $report += $tables
    $report += ""
    
    $transCount = docker exec gsm_db psql -U gsm_user -d gsm_db -t -c "SELECT COUNT(*) FROM transactions;" 2>&1
    $report += "Transactions count: $($transCount.Trim())"
    
    $cardsCount = docker exec gsm_db psql -U gsm_user -d gsm_db -t -c "SELECT COUNT(*) FROM fuel_cards;" 2>&1
    $report += "Fuel cards count: $($cardsCount.Trim())"
    
    $stationsCount = docker exec gsm_db psql -U gsm_user -d gsm_db -t -c "SELECT COUNT(*) FROM gas_stations;" 2>&1
    $report += "Gas stations count: $($stationsCount.Trim())"
} catch {
    $report += "Failed to get database information"
}
$report += ""

# Migrations
$report += Write-Section "ALEMBIC MIGRATIONS"
try {
    $migration = docker exec gsm_backend alembic current 2>&1
    $report += "Current migration version:"
    $report += $migration
} catch {
    $report += "Failed to get migration information"
}
$report += ""

# Configuration
$report += Write-Section "CONFIGURATION"
if (Test-Path "backend\.env") {
    $report += "File backend\.env exists"
    $envContent = Get-Content "backend\.env" | Where-Object { $_ -notmatch "PASSWORD|SECRET|KEY" }
    $report += "Public settings:"
    $report += $envContent
} else {
    $report += "File backend\.env NOT FOUND!"
}
$report += ""

# Network settings
$report += Write-Section "NETWORK SETTINGS"
try {
    $report += "Open GSM ports:"
    $ports = netstat -an | Select-String "8000|5432|6379|3000|3001"
    $report += $ports
} catch {
    $report += "Failed to get port information"
}
$report += ""

# Health check
$report += Write-Section "HEALTH CHECK"
try {
    $health = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 5
    $report += "Backend health check: OK (Status: $($health.StatusCode))"
} catch {
    $report += "Backend health check: FAILED"
}
$report += ""

# Data sizes
$report += Write-Section "DATA SIZES"
try {
    $dbSize = docker exec gsm_db psql -U gsm_user -d gsm_db -t -c "SELECT pg_size_pretty(pg_database_size('gsm_db'));" 2>&1
    $report += "Database size: $($dbSize.Trim())"
} catch {
    $report += "Failed to get database size"
}
$report += ""

# Save report
$report | Out-File -FilePath (Join-Path $PSScriptRoot $OutputFile) -Encoding UTF8

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  REPORT SAVED" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "File: $OutputFile" -ForegroundColor Green
Write-Host ""
Write-Host "Copy this file with backups to the new server" -ForegroundColor Yellow
Write-Host "for reference about old server configuration." -ForegroundColor Yellow
Write-Host ""

# Display report
Get-Content (Join-Path $PSScriptRoot $OutputFile)
