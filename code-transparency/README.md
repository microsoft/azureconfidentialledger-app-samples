# Code Transparency Sample

A sample application demonstrating how to build a **code transparency log** using Azure Confidential Ledger [User-Defined Endpoints (UDE)](https://learn.microsoft.com/azure/confidential-ledger/user-defined-endpoints). Organizations can publish signed build measurements, SBOMs, and model cards to a tamper-proof ledger that anyone can verify.

This sample showcases:
- **UDE development** — Custom TypeScript endpoints deployed as a JS bundle to ACL
- **COSE_Sign1 signing** — Cryptographic signing of transparency claims
- **Per-scope policy enforcement** — Configurable admission policies (issuer allowlists, algorithm filters, freshness checks)
- **Code transparency verification** — Client-side verification of published measurements against live TEE attestation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  sign_tool.py (CLI)                                         │
│  - Generate signing keys                                    │
│  - Sign payloads into COSE_Sign1 envelopes                  │
│  - Submit entries to ledger                                 │
│  - Query policies                                           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  UDE Bundle (TypeScript → JS)                               │
│                                                             │
│  POST   /scopes/{owner}/{scope}              Create scope   │
│  GET    /scopes/{owner}/{scope}              Get scope info  │
│  GET    /scopes                              List scopes     │
│  PATCH  /scopes/{owner}/{scope}/policy       Update policy   │
│  POST   /scopes/{owner}/{scope}/entries      Submit entry    │
│  GET    /scopes/{owner}/{scope}/entries      List entries    │
│  GET    /scopes/{owner}/{scope}/entries/{id} Get entry       │
│  GET    /scopes/{owner}/{scope}/verify       Verify latest   │
│  GET    /policies                            Policy catalog  │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Azure Confidential Ledger                                  │
│  - TEE-backed (SNP) tamper-proof storage                │
│  - Custom KV tables with Merkle tree integrity              │
│  - Built-in RBAC and audit trail                            │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Software

1. **Node.js** (version 16 or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify: `node --version`

2. **npm** (comes with Node.js)
   - Verify: `npm --version`

3. **Python 3.8+** (for the signing tool)
   - Install dependencies: `pip install pycose cbor2 cryptography`

4. **Azure CLI**
   - Install from [docs.microsoft.com/cli/azure/install-azure-cli](https://docs.microsoft.com/cli/azure/install-azure-cli)
   - Login: `az login`

5. **curl** — for API testing

6. **PowerShell** (pwsh) — for deploy and test scripts
   - Linux/macOS: Install [PowerShell Core](https://github.com/PowerShell/PowerShell)
   - Windows: Available by default

### Azure Requirements

- An active Azure subscription
- An Azure Confidential Ledger instance with UDE support (API version `2024-08-22-preview`)
- Permissions to deploy UDE bundles to the ledger

## Setup

1. **Install dependencies**:
   ```bash
   cd code-transparency
   npm install
   ```

2. **Configure your ledger name** (used by deploy and test scripts):
   ```bash
   export LEDGER_NAME="your-ledger-name"
   # Or on Windows:
   $env:LEDGER_NAME = "your-ledger-name"
   ```

3. **Install Python signing tool dependencies**:
   ```bash
   pip install pycose cbor2 cryptography
   ```

## Build

```bash
npm run build
```

This produces `dist/bundle.json` — the UDE bundle ready for deployment.

## Deploy

```bash
# PowerShell
./deploy.ps1 -LedgerName your-ledger-name

# Or using Make (reads LEDGER_NAME env var)
make deploy
```

The script authenticates via `az account get-access-token` and uploads the bundle to your ledger's UDE endpoint.

## Usage Walkthrough: Code Transparency

This walkthrough demonstrates publishing a build measurement to the ledger and verifying it — the core "code transparency" workflow.

### 1. Create a scope with a policy

```bash
# Get a token
TOKEN=$(az account get-access-token --resource https://confidential-ledger.azure.com --query accessToken -o tsv)

# Create a scope with issuer allowlist and content type filter
curl -k -X POST "https://$LEDGER_NAME.confidential-ledger.azure.com/app/scopes/myorg/builds" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "policy": {
      "issuerAllowlist": ["did:web:github-actions.myorg.com"],
      "contentTypeFilter": ["application/vnd.codetransparency.measurement+json"]
    }
  }'
```

### 2. Generate a signing key

```bash
python sign_tool.py keygen --out build-signer
# Creates: build-signer.pem (private) and build-signer.pub.pem (public)
```

### 3. Sign a build measurement

```bash
python sign_tool.py sign \
  --key build-signer.pem \
  --payload-file test/fixtures/tee_card.json \
  --issuer "did:web:github-actions.myorg.com" \
  --content-type "application/vnd.codetransparency.measurement+json" \
  --out measurement.cose
```

### 4. Submit to the ledger

```bash
python sign_tool.py submit \
  --scope myorg/builds \
  --envelope measurement.cose \
  --ledger-url "https://$LEDGER_NAME.confidential-ledger.azure.com"
```

### 5. Verify

```bash
# Get the latest measurement for verification
curl -k "https://$LEDGER_NAME.confidential-ledger.azure.com/app/scopes/myorg/builds/verify"

# Compare the returned measurement against a live enclave's attestation report
```

## Testing

Run the end-to-end test suite (requires a deployed ledger):

```bash
# Set the target ledger
export LEDGER_NAME="your-ledger-name"

# Run tests
make test

# Or directly:
pwsh test/test-e2e.ps1
```

The test suite covers 3 scenarios (22 tests):
1. **No-policy scope** — submit and retrieve entries with no restrictions
2. **Issuer + algorithm filter** — verify policy-based accept/reject
3. **SBOM + freshness** — content type filtering and signature age checks

## Project Structure

```
code-transparency/
├── src/
│   ├── endpoints/          # UDE endpoint handlers
│   │   ├── scope_mgmt.ts  # Scope CRUD & policy management
│   │   ├── entries.ts      # Entry submission & retrieval
│   │   ├── policy_catalog.ts # Policy catalog listing
│   │   ├── common.ts       # Shared helpers
│   │   └── all.ts          # Barrel export
│   ├── models/
│   │   └── schema.ts       # KV table definitions & TypeScript types
│   └── policies/
│       └── engine.ts        # Composable policy evaluation engine
├── sign_tool.py             # Python CLI: keygen, sign, inspect, submit
├── deploy.ps1               # Deploy bundle to ACL (parameterized)
├── test/
│   ├── test-e2e.ps1         # End-to-end test suite
│   └── fixtures/            # Test data (measurement cards)
├── app.json                 # UDE endpoint metadata
├── build_bundle.js          # Bundle generation script
├── rollup.config.js         # Rollup build config
├── tsconfig.json            # TypeScript config
├── package.json             # Node.js dependencies
└── Makefile                 # Build/deploy/test targets
```

## Key Concepts

### User-Defined Endpoints (UDE)

UDEs allow you to deploy custom JavaScript logic that runs inside the Confidential Ledger's TEE. This sample demonstrates:
- Defining endpoint routes in `app.json`
- Using CCF's KV store for persistent state
- Authentication with JWT and COSE_Sign1
- Read-only vs read-write endpoint modes

### Code Transparency Pattern

The "code transparency" pattern ensures that build artifacts (binaries, containers, AI models) can be verified against a trusted log:

1. **Publish** — CI/CD signs a build measurement card and submits to the ledger
2. **Discover** — Clients query the ledger for the latest measurement for a given scope/feed
3. **Verify** — Clients compare the ledger's measurement against the live enclave's attestation report
4. **Trust** — If measurements match, the enclave is running exactly what was published by the authorized CI pipeline

### Policy Blocks

Scopes can enforce admission policies using composable blocks:

| Block | Description |
|---|---|
| `issuerAllowlist` | Only accept claims from listed issuer DIDs |
| `signatureFreshness` | Reject signatures older than N seconds |
| `allowedAlgorithms` | Restrict COSE signing algorithms |
| `contentTypeFilter` | Only accept specific content types |
| `minimumSVN` | Require minimum security version number |
| `requireAttestation` | Require TEE attestation evidence |

## Example Policies & Use Cases

### 1. AI Model Transparency (Code Transparency for AI)

Publish signed model cards from CI/CD so users can verify which model is running inside a TEE.

```json
{
  "policy": {
    "issuerAllowlist": ["did:web:github-actions.contoso.com"],
    "contentTypeFilter": ["application/vnd.codetransparency.measurement+json"],
    "requireAttestation": true
  }
}
```

**Workflow:** CI pipeline builds a model image → signs a measurement card inside the TEE → submits to scope `contoso/model-router`. Clients query `/verify?feed=gpt-4` and compare the ledger's measurement against the live enclave's attestation report.

---

### 2. Supply Chain SBOM Log

Publish SBOMs for every release; downstream consumers verify provenance.

```json
{
  "policy": {
    "issuerAllowlist": ["did:web:release-pipeline.contoso.com"],
    "contentTypeFilter": ["application/spdx+json", "application/vnd.cyclonedx+json"],
    "signatureFreshness": 86400,
    "allowedAlgorithms": ["ES256"]
  }
}
```

**Workflow:** Release pipeline signs SBOM → submits to `contoso/sbom`. Package consumers verify that any SBOM was published by the authorized pipeline within 24 hours, using only ES256 signatures.

---

### 3. Firmware Integrity for IoT

Hardware manufacturer publishes firmware build measurements with strict version control.

```json
{
  "policy": {
    "issuerAllowlist": ["did:web:firmware-ci.acme.com"],
    "allowedAlgorithms": ["ES256"],
    "minimumSVN": 5,
    "signatureFreshness": 172800
  }
}
```

**Workflow:** Firmware CI signs each release → submits to `acme/firmware`. Device update agents query the ledger before applying updates, rejecting anything below SVN 5 or older than 48 hours.

---

### 4. Open Policy (Accept Everything)

For development, testing, or open-source projects that just want an immutable log.

```json
{
  "policy": {}
}
```

**Workflow:** Any signer can submit any content type. Useful for prototyping or projects where the audit trail matters more than admission control.

---

### 5. Multi-Vendor Compliance Attestation

A regulator restricts who can publish compliance reports.

```json
{
  "policy": {
    "issuerAllowlist": [
      "did:web:auditor-a.approved.finreg.gov",
      "did:web:auditor-b.approved.finreg.gov"
    ],
    "contentTypeFilter": ["application/vnd.finreg.attestation+json"],
    "signatureFreshness": 604800
  }
}
```

**Workflow:** Only approved auditors can submit attestations to `finreg/compliance-2024`. Reports must be fresh (within 7 days). Regulators and the public independently verify the audit trail.

---

### Composing Policies

Policies are additive — each block you include adds an additional check. An entry must pass **all** configured blocks to be admitted. Blocks you omit are not enforced:

```bash
# View available policy blocks and their parameters
curl -k "https://$LEDGER_NAME.confidential-ledger.azure.com/app/policies"

# Update a scope's policy (adds freshness to existing scope)
curl -k -X PATCH "https://$LEDGER_NAME.confidential-ledger.azure.com/app/scopes/myorg/builds/policy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "policy": {
      "issuerAllowlist": ["did:web:ci.myorg.com"],
      "signatureFreshness": 3600,
      "contentTypeFilter": ["application/vnd.codetransparency.measurement+json"]
    }
  }'
```

All policy changes are audit-logged on the ledger (who changed, when, previous vs new config).

## Related Resources

- [Azure Confidential Ledger documentation](https://learn.microsoft.com/azure/confidential-ledger/)
- [UDE API reference](https://learn.microsoft.com/azure/confidential-ledger/user-defined-endpoints)
- [COSE_Sign1 (RFC 9052)](https://datatracker.ietf.org/doc/rfc9052/)
- [SCITT Architecture](https://datatracker.ietf.org/doc/draft-ietf-scitt-architecture/)
