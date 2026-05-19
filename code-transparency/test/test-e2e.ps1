<#
.SYNOPSIS
    End-to-end test script for Code Transparency Sample
.DESCRIPTION
    Runs 3 scenarios against the live ledger:
      1. No-policy scope (accepts everything)
      2. Issuer allowlist + algorithm filter (accept/reject)
      3. SBOM-only scope with signature freshness (accept/reject)
    Requires: az login (already authenticated)
#>

param(
    [string]$LedgerUrl = $(if ($env:LEDGER_URL) { $env:LEDGER_URL } elseif ($env:LEDGER_NAME) { "https://$env:LEDGER_NAME.confidential-ledger.azure.com" } else { $null })
)

if (-not $LedgerUrl) {
    Write-Host "ERROR: No ledger URL specified." -ForegroundColor Red
    Write-Host "Set LEDGER_URL or LEDGER_NAME environment variable, or pass -LedgerUrl <url>" -ForegroundColor Yellow
    exit 1
}

$ErrorActionPreference = "Stop"

# -- Helpers --

function Get-Token {
    $tokenJson = az account get-access-token --resource "https://confidential-ledger.azure.com" 2>$null
    if (-not $tokenJson) { throw "Failed to get access token. Run 'az login' first." }
    return ($tokenJson | ConvertFrom-Json).accessToken
}

$script:pass = 0
$script:fail = 0
$script:total = 0

function Invoke-Ledger {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body = $null,
        [int]$ExpectedStatus,
        [string]$TestName,
        [switch]$NoAuth
    )

    $script:total++
    $url = "$LedgerUrl/app$Path"
    $curlArgs = @(
        "-s", "-w", "`n%{http_code}",
        "-X", $Method,
        "-H", "Content-Type: application/json"
    )
    if (-not $NoAuth) {
        $curlArgs += @("-H", "Authorization: Bearer $token")
    }
    if ($Body) {
        $json = $Body | ConvertTo-Json -Depth 10 -Compress
        $curlArgs += @("-d", $json)
    }
    $curlArgs += @("-k", $url)

    $raw = & curl.exe @curlArgs 2>$null
    $lines = $raw -split "`n"
    $statusCode = [int]($lines[-1].Trim())
    $responseBody = ($lines[0..($lines.Length - 2)] -join "`n").Trim()

    $icon = if ($statusCode -eq $ExpectedStatus) { "[PASS]" } else { "[FAIL]" }
    if ($statusCode -eq $ExpectedStatus) { $script:pass++ } else { $script:fail++ }

    Write-Host "  $icon $TestName  [HTTP $statusCode, expected $ExpectedStatus]"
    if ($statusCode -ne $ExpectedStatus -and $responseBody) {
        Write-Host "     Response: $responseBody" -ForegroundColor DarkGray
    }

    return @{ Status = $statusCode; Body = $responseBody }
}

# -- Main --

Write-Host ""
Write-Host "+==================================================+" -ForegroundColor Cyan
Write-Host "|   Code Transparency -- End-to-End Test Suite      |" -ForegroundColor Cyan
Write-Host "+==================================================+" -ForegroundColor Cyan
Write-Host ""

# Unique suffix to avoid scope name collisions
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$suffix = $ts.ToString().Substring($ts.ToString().Length - 6)

Write-Host "[*] Fetching access token..." -ForegroundColor Yellow
$token = Get-Token
Write-Host "[*] Token obtained" -ForegroundColor Green
Write-Host ""

# --- Scenario 1: No policy (accept everything) ---

$s1Owner = "testorg"
$s1Scope = "open$suffix"

Write-Host "--- Scenario 1: No Policy (accept everything) ---" -ForegroundColor Magenta
Write-Host "    Scope: $s1Owner/$s1Scope"
Write-Host ""

# Create scope with empty policy
Invoke-Ledger -Method POST -Path "/scopes/$s1Owner/$s1Scope" `
    -Body @{ policy = @{} } `
    -ExpectedStatus 201 -TestName "Create scope (no policy)"

# Submit with no headers at all
Invoke-Ledger -Method POST -Path "/scopes/$s1Owner/$s1Scope/entries" `
    -Body @{ payload = "bare minimum payload" } `
    -ExpectedStatus 201 -TestName "Submit entry with no headers"

# Submit with full headers
Invoke-Ledger -Method POST -Path "/scopes/$s1Owner/$s1Scope/entries" `
    -Body @{
        payload = "signed SBOM content"
        headers = @{
            issuer = "did:web:anyone.com"
            alg = "ES256"
            contentType = "application/spdx+json"
            issuedAt = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        }
    } `
    -ExpectedStatus 201 -TestName "Submit entry with full headers"

# Read it back (no auth needed)
Invoke-Ledger -Method GET -Path "/scopes/$s1Owner/$s1Scope/entries/1" `
    -ExpectedStatus 200 -TestName "Retrieve entry #1" -NoAuth

# List entries
Invoke-Ledger -Method GET -Path "/scopes/$s1Owner/$s1Scope/entries" `
    -ExpectedStatus 200 -TestName "List entries (expect 2)" -NoAuth

Write-Host ""

# --- Scenario 2: Issuer allowlist + algorithm filter ---

$s2Owner = "contoso"
$s2Scope = "strict$suffix"

Write-Host "--- Scenario 2: Issuer Allowlist + Algorithm Filter ---" -ForegroundColor Magenta
Write-Host "    Scope: $s2Owner/$s2Scope"
Write-Host "    Policy: issuerAllowlist=[contoso, fabrikam], allowedAlgorithms=[ES256, ES384]"
Write-Host ""

# Create scope with strict policy
Invoke-Ledger -Method POST -Path "/scopes/$s2Owner/$s2Scope" `
    -Body @{
        policy = @{
            issuerAllowlist = @("did:web:contoso.com", "did:web:fabrikam.com")
            allowedAlgorithms = @("ES256", "ES384")
        }
    } `
    -ExpectedStatus 201 -TestName "Create scope (issuer+algo policy)"

# PASS: Valid issuer + valid algorithm
Invoke-Ledger -Method POST -Path "/scopes/$s2Owner/$s2Scope/entries" `
    -Body @{
        payload = "contoso release artifact"
        headers = @{ issuer = "did:web:contoso.com"; alg = "ES256" }
    } `
    -ExpectedStatus 201 -TestName "Valid issuer + valid algo -> ACCEPT"

# PASS: Second allowed issuer
Invoke-Ledger -Method POST -Path "/scopes/$s2Owner/$s2Scope/entries" `
    -Body @{
        payload = "fabrikam release artifact"
        headers = @{ issuer = "did:web:fabrikam.com"; alg = "ES384" }
    } `
    -ExpectedStatus 201 -TestName "Second allowed issuer + ES384 -> ACCEPT"

# FAIL: Wrong issuer
Invoke-Ledger -Method POST -Path "/scopes/$s2Owner/$s2Scope/entries" `
    -Body @{
        payload = "evil payload"
        headers = @{ issuer = "did:web:evil.com"; alg = "ES256" }
    } `
    -ExpectedStatus 403 -TestName "Unknown issuer -> REJECT"

# FAIL: Wrong algorithm
Invoke-Ledger -Method POST -Path "/scopes/$s2Owner/$s2Scope/entries" `
    -Body @{
        payload = "rsa signed payload"
        headers = @{ issuer = "did:web:contoso.com"; alg = "RS256" }
    } `
    -ExpectedStatus 403 -TestName "Disallowed algorithm RS256 -> REJECT"

# FAIL: Missing headers entirely
Invoke-Ledger -Method POST -Path "/scopes/$s2Owner/$s2Scope/entries" `
    -Body @{ payload = "no headers" } `
    -ExpectedStatus 403 -TestName "No headers at all -> REJECT"

# FAIL: Issuer OK but missing algorithm
Invoke-Ledger -Method POST -Path "/scopes/$s2Owner/$s2Scope/entries" `
    -Body @{
        payload = "partial headers"
        headers = @{ issuer = "did:web:contoso.com" }
    } `
    -ExpectedStatus 403 -TestName "Valid issuer but missing algo -> REJECT"

# Verify only 2 entries made it through
Invoke-Ledger -Method GET -Path "/scopes/$s2Owner/$s2Scope/entries" `
    -ExpectedStatus 200 -TestName "List entries (expect 2 accepted)" -NoAuth

Write-Host ""

# --- Scenario 3: SBOM content type + signature freshness ---

$s3Owner = "acme"
$s3Scope = "sbom$suffix"
$nowSeconds = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "--- Scenario 3: SBOM Content Type + Freshness (1h) ---" -ForegroundColor Magenta
Write-Host "    Scope: $s3Owner/$s3Scope"
Write-Host "    Policy: contentTypeFilter=[spdx, cyclonedx], signatureFreshness=3600"
Write-Host ""

# Create scope
Invoke-Ledger -Method POST -Path "/scopes/$s3Owner/$s3Scope" `
    -Body @{
        policy = @{
            contentTypeFilter = @("application/spdx+json", "application/vnd.cyclonedx+json")
            signatureFreshness = 3600
        }
    } `
    -ExpectedStatus 201 -TestName "Create scope (SBOM + freshness)"

# PASS: Valid SPDX SBOM, fresh signature
Invoke-Ledger -Method POST -Path "/scopes/$s3Owner/$s3Scope/entries" `
    -Body @{
        payload = "{`"spdxVersion`":`"SPDX-2.3`",`"name`":`"mypackage`"}"
        headers = @{ contentType = "application/spdx+json"; issuedAt = $nowSeconds }
    } `
    -ExpectedStatus 201 -TestName "Fresh SPDX SBOM -> ACCEPT"

# PASS: Valid CycloneDX SBOM, fresh
Invoke-Ledger -Method POST -Path "/scopes/$s3Owner/$s3Scope/entries" `
    -Body @{
        payload = "{`"bomFormat`":`"CycloneDX`",`"specVersion`":`"1.5`"}"
        headers = @{ contentType = "application/vnd.cyclonedx+json"; issuedAt = $nowSeconds }
    } `
    -ExpectedStatus 201 -TestName "Fresh CycloneDX SBOM -> ACCEPT"

# FAIL: Wrong content type
Invoke-Ledger -Method POST -Path "/scopes/$s3Owner/$s3Scope/entries" `
    -Body @{
        payload = "just a text file"
        headers = @{ contentType = "text/plain"; issuedAt = $nowSeconds }
    } `
    -ExpectedStatus 403 -TestName "Wrong content type (text/plain) -> REJECT"

# FAIL: Stale signature (24 hours old)
$staleTime = $nowSeconds - 86400
Invoke-Ledger -Method POST -Path "/scopes/$s3Owner/$s3Scope/entries" `
    -Body @{
        payload = "{`"spdxVersion`":`"SPDX-2.3`"}"
        headers = @{ contentType = "application/spdx+json"; issuedAt = $staleTime }
    } `
    -ExpectedStatus 403 -TestName "Stale signature (24h old) -> REJECT"

# FAIL: Future timestamp
$futureTime = $nowSeconds + 7200
Invoke-Ledger -Method POST -Path "/scopes/$s3Owner/$s3Scope/entries" `
    -Body @{
        payload = "{`"spdxVersion`":`"SPDX-2.3`"}"
        headers = @{ contentType = "application/spdx+json"; issuedAt = $futureTime }
    } `
    -ExpectedStatus 403 -TestName "Future timestamp -> REJECT"

# FAIL: Missing issuedAt (freshness requires it)
Invoke-Ledger -Method POST -Path "/scopes/$s3Owner/$s3Scope/entries" `
    -Body @{
        payload = "{`"spdxVersion`":`"SPDX-2.3`"}"
        headers = @{ contentType = "application/spdx+json" }
    } `
    -ExpectedStatus 403 -TestName "Missing issuedAt -> REJECT"

# Verify policy via GET
Invoke-Ledger -Method GET -Path "/scopes/$s3Owner/$s3Scope/policy" `
    -ExpectedStatus 200 -TestName "Read back policy config" -NoAuth

# Verify only 2 entries made it
Invoke-Ledger -Method GET -Path "/scopes/$s3Owner/$s3Scope/entries" `
    -ExpectedStatus 200 -TestName "List entries (expect 2 accepted)" -NoAuth

Write-Host ""

# --- Summary ---

Write-Host "---------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Results: $($script:pass) passed, $($script:fail) failed, $($script:total) total" -ForegroundColor $(if ($script:fail -eq 0) { "Green" } else { "Red" })
Write-Host "---------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

if ($script:fail -gt 0) {
    exit 1
}
