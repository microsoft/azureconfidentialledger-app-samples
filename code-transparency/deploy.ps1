#!/usr/bin/env pwsh
# deploy.ps1 — Deploy the UDE bundle to Azure Confidential Ledger
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Bundle built (npm run build)
#
# Usage:
#   ./deploy.ps1

param(
    [string]$LedgerName = $env:LEDGER_NAME
)

$ErrorActionPreference = "Stop"

if (-not $LedgerName) {
    Write-Host "ERROR: Ledger name not specified." -ForegroundColor Red
    Write-Host "Set the LEDGER_NAME environment variable or pass -LedgerName <name>" -ForegroundColor Yellow
    Write-Host "Example: ./deploy.ps1 -LedgerName myledger" -ForegroundColor Yellow
    exit 1
}

$LedgerUrl = "https://$LedgerName.confidential-ledger.azure.com"
$ApiVersion = "2024-08-22-preview"
$BundlePath = "$PSScriptRoot/dist/bundle.json"

Write-Host "=== Code Transparency — Deployment ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check bundle exists
if (-not (Test-Path $BundlePath)) {
    Write-Host "ERROR: Bundle not found at $BundlePath" -ForegroundColor Red
    Write-Host "Run 'npm run build' first." -ForegroundColor Yellow
    exit 1
}
$bundleSize = (Get-Item $BundlePath).Length
Write-Host "[1/4] Bundle found: $BundlePath ($($bundleSize) bytes)" -ForegroundColor Green

# 2. Get access token via Azure CLI
Write-Host "[2/4] Fetching Azure access token..." -ForegroundColor Yellow
$tokenJson = az account get-access-token --resource https://confidential-ledger.azure.com 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to get access token. Run 'az login' first." -ForegroundColor Red
    Write-Host $tokenJson
    exit 1
}
$token = ($tokenJson | ConvertFrom-Json).accessToken
Write-Host "[2/4] Access token obtained" -ForegroundColor Green

# 3. Download service certificate (skip if identity service doesn't know this ledger)
Write-Host "[3/4] Downloading ledger service certificate..." -ForegroundColor Yellow
$certUrl = "https://identity.confidential-ledger.core.azure.com/ledgerIdentity/$LedgerName"
$certPath = "$PSScriptRoot/service_cert.pem"
$hasCert = $false
try {
    $certJson = Invoke-RestMethod -Uri $certUrl -ErrorAction Stop
    $certPem = $certJson.ledgerTlsCertificate
    $certPem | Out-File -FilePath $certPath -Encoding utf8 -NoNewline
    Write-Host "[3/4] Service certificate saved to $certPath" -ForegroundColor Green
    $hasCert = $true
} catch {
    Write-Host "[3/4] Identity service unavailable for this ledger, will use -k" -ForegroundColor Yellow
}

# 4. Deploy the bundle
Write-Host "[4/4] Deploying UDE bundle to $LedgerUrl ..." -ForegroundColor Yellow
$deployUrl = "$LedgerUrl/app/userDefinedEndpoints?api-version=$ApiVersion"

try {
    # Use cert if available, otherwise -k
    if ($hasCert) {
        $curlArgs = @(
            "--cacert", $certPath,
            "--ssl-no-revoke",
            "-X", "PUT",
            "-H", "Content-Type: application/json",
            "-H", "Authorization: Bearer $token",
            "-w", "`n%{http_code}",
            "-s",
            "-d", "@$BundlePath",
            $deployUrl
        )
        $env:CURL_SSL_BACKEND = "openssl"
        $output = & curl.exe @curlArgs 2>&1

        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Retrying with certificate verification disabled..." -ForegroundColor Yellow
            $hasCert = $false
        }
    }

    if (-not $hasCert) {
        $curlArgs = @(
            "-k",
            "-X", "PUT",
            "-H", "Content-Type: application/json",
            "-H", "Authorization: Bearer $token",
            "-w", "`n%{http_code}",
            "-s",
            "-d", "@$BundlePath",
            $deployUrl
        )
        $output = & curl.exe @curlArgs 2>&1
    }
    $lines = $output -split "`n"
    $httpCode = $lines[-1].Trim()
    $body = ($lines[0..($lines.Length - 2)]) -join "`n"

    if ($httpCode -match "^2\d\d$") {
        Write-Host ""
        Write-Host "=== Deployment Successful (HTTP $httpCode) ===" -ForegroundColor Green
        Write-Host "Ledger:    $LedgerUrl" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Endpoints deployed:" -ForegroundColor Cyan
        Write-Host "  POST   /app/scopes/{owner}/{scope}              - Create scope"
        Write-Host "  GET    /app/scopes/{owner}/{scope}              - Get scope info"
        Write-Host "  GET    /app/scopes/{owner}/{scope}/policy       - View policy"
        Write-Host "  PATCH  /app/scopes/{owner}/{scope}/policy       - Update policy"
        Write-Host "  POST   /app/scopes/{owner}/{scope}/entries      - Submit entry"
        Write-Host "  GET    /app/scopes/{owner}/{scope}/entries      - List entries"
        Write-Host "  GET    /app/scopes/{owner}/{scope}/entries/{id} - Get entry"
        Write-Host "  GET    /app/policies                            - Policy catalog"
        Write-Host ""

        if ($body) {
            Write-Host "Response:" -ForegroundColor Yellow
            Write-Host $body
        }
    } else {
        Write-Host ""
        Write-Host "=== Deployment Failed (HTTP $httpCode) ===" -ForegroundColor Red
        if ($body) {
            Write-Host "Response: $body" -ForegroundColor Red
        }
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "=== Deployment Failed ===" -ForegroundColor Red
    Write-Host "Error:  $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
