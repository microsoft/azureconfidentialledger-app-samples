# Quickstart: Deploy & Verify in 5 Minutes

This guide gets you from zero to a working code transparency log on Azure Confidential Ledger.

## Prerequisites

- Azure CLI logged in (`az login`)
- An ACL instance with UDE support (set `LEDGER_NAME` below)
- Node.js 16+, Python 3.8+

## Steps

```bash
# 0. Set your ledger name
export LEDGER_NAME="your-ledger-name"
export LEDGER_URL="https://$LEDGER_NAME.confidential-ledger.azure.com"

# 1. Build and deploy the UDE bundle
cd code-transparency
npm install
npm run build
pwsh deploy.ps1 -LedgerName $LEDGER_NAME

# 2. Get a token
TOKEN=$(az account get-access-token --resource https://confidential-ledger.azure.com --query accessToken -o tsv)

# 3. Create a scope (no policy — accepts anything)
curl -k -X POST "$LEDGER_URL/app/scopes/demo/quickstart" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# 4. Generate a signing key
pip install pycose cbor2 cryptography
python sign_tool.py keygen --out demo-key

# 5. Sign a test payload
echo '{"build":"v1.0.0","commit":"abc123"}' > payload.json
python sign_tool.py sign \
  --key demo-key.pem \
  --payload-file payload.json \
  --issuer "did:web:example.com" \
  --content-type "application/json" \
  --out demo.cose

# 6. Submit to the ledger
python sign_tool.py submit \
  --scope demo/quickstart \
  --envelope demo.cose \
  --ledger-url $LEDGER_URL

# 7. Verify — retrieve the latest entry
curl -k "$LEDGER_URL/app/scopes/demo/quickstart/verify"

# 8. List all entries in the scope
curl -k "$LEDGER_URL/app/scopes/demo/quickstart/entries"
```

## What Just Happened?

1. You deployed custom UDE logic (TypeScript → JS bundle) to your Confidential Ledger
2. Created a transparency scope (`demo/quickstart`)
3. Signed a build measurement with a COSE_Sign1 envelope
4. Submitted it to the TEE-backed ledger (tamper-proof, Merkle tree integrity)
5. Verified the entry is retrievable and intact

## Next Steps

- Add a **policy** to your scope (issuer allowlist, content type filter) — see [README.md](README.md#key-concepts)
- Integrate signing into your **CI/CD pipeline** (GitHub Actions, Azure DevOps)
- Use the **verify endpoint** to compare ledger measurements against live TEE attestation
- Explore the [test suite](test/test-e2e.ps1) for more advanced scenarios
