# Policy engine

This sample implements a versioned JSON Logic policy engine using
[Azure Confidential Ledger (ACL)](https://learn.microsoft.com/azure/confidential-ledger/overview)
user-defined endpoints. It demonstrates storing policies in a CCF key-value
table, evaluating them against caller-supplied facts, and restricting access
through Microsoft Entra JWT authentication and custom ledger roles.

The example policy allows a document transfer only when the operation is
`transfer` and the document status is `approved`. Pending or empty statuses
produce `Deny`. Policies return JSON Logic results; the sample does not perform
the document transfer or enforce the decision in another application.

## Project structure

- [src/endpoints/policy.ts](./src/endpoints/policy.ts): policy validation, storage,
  evaluation, retrieval, and role checks.
- [app.json](./app.json): endpoint routing and JWT authentication configuration.
- [build_bundle.js](./build_bundle.js): creates the deployment bundle.
- [test/test.sh](./test/test.sh): Azure integration setup and policy tests.
- [test/data/](./test/data/): example policy and evaluation inputs. The integration
  script currently embeds equivalent data rather than reading these files.

## Prerequisites

For building:

- Node.js 16 or higher, as declared in [package.json](./package.json), and npm.
  Prefer a currently supported Node.js release.
- Git to clone this repository.
- Make is optional; `npm run build` builds the application directly.

For Azure integration tests:

- Bash, curl, jq, base64, and GNU-compatible utilities including `md5sum`.
  On Windows, WSL provides a suitable shell environment.
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), with
  `az confidentialledger` commands available.
- An Azure subscription and permission to create and delete resource groups
  and Standard ACL instances when testing with a new ledger.
- A Microsoft Entra access token accepted by the target ledger, with a non-empty
  string `oid` claim. For an existing ledger, the token's identity must already
  be a ledger Administrator.

This sample uses JWT authentication; its policy test script does not generate
client certificates or require OpenSSL.

## Build

Run from the repository root:

```bash
cd policy-engine
npm install
npm run build
```

The build compiles and bundles the TypeScript endpoints with Rollup, copies
the endpoint configuration, and generates `dist/bundle.json` for deployment.
Run the tests below from the repository root (`cd ..` after building).

## Policy API

All endpoints require a JWT whose `oid` identifies a registered ledger user
with the appropriate custom action. Paths below include the `/app` prefix used
to call ACL application endpoints.

| Method | Endpoint |  Successful response |
| --- | --- | --- |
| PUT | `/app/policy/{policy_name}/{policy_version}/create` | HTTP 204 |
| POST | `/app/policy/{policy_name}/{policy_version}/evaluate` | HTTP 200 with the JSON Logic result |
| GET | `/app/policy/{policy_name}/{policy_version}` | HTTP 200 with the stored JSON-encoded rule |

Policy names and versions are trimmed and lowercased before their combined
key is hashed with SHA-256. Creating an existing name/version replaces its
rule; it does not return a conflict.

The integration script defines a `policy-admin` role with write, delete,
evaluate, and get actions, and a `user` role with evaluate and get actions.
There is currently no delete endpoint.

### Create or replace a policy

Send a JSON Logic expression as the `rule` value:

```json
{
  "rule": {
    "if": [
      {
        "and": [
          { "==": [{ "var": "operation" }, "transfer"] },
          { "==": [{ "var": "document.status" }, "approved"] }
        ]
      },
      "Allow",
      "Deny"
    ]
  }
}
```

The handler JSON-encodes `rule` before storing it as `{ rule: string }`.
Use an inline expression, not a pre-encoded JSON string: a string is treated as
a literal by JSON Logic rather than parsed as an expression.

Validation permits literals, arrays, and single-operator objects using:
`var`, `==`, `===`, `!=`, `!==`, `>`, `>=`, `<`, `<=`, `and`, `or`, `!`,
`+`, `-`, `*`, `/`, `%`, `if`, `in`, `cat`, `min`, and `max`.
Invalid rules return HTTP 400.

### Evaluate a policy

Pass facts as the `input` value:

```json
{
  "input": {
    "operation": "transfer",
    "document": { "status": "approved" }
  }
}
```

For the example above, the response body is the JSON string `"Allow"`, not
`{ "result": "Allow" }`. Changing the status to `pending` or an empty string
returns `"Deny"`.

The current handlers return HTTP 400 when a registered caller lacks the
required action. Retrieving a missing policy returns HTTP 404 when the policy
table exists; evaluation of a missing policy or an unavailable policy table
currently returns HTTP 500.

## How to run the tests

Use [test/test.sh](./test/test.sh) directly. The current `make test` target
calls the shared banking test runner, so it is not the policy integration test
entry point. Although `npm test` is declared in [package.json](./package.json),
its referenced `test/policy.test.cjs` file is absent; there is currently no
runnable local regression suite at that path.

### Authenticate

```bash
az login
az account set --subscription "<subscription-id>"
az account show --query "{subscriptionId:id, tenantId:tenantId}" -o table
```

Obtain an unexpired access token for the target ledger's accepted audience
using your Microsoft Entra authentication flow. An Azure CLI management token
is not necessarily valid for ledger data-plane requests. To avoid recording
the token in shell history, read it interactively:

```bash
read -r -s -p "Ledger access token: " ACCESS_TOKEN
printf '\n'
```

The script always Base64URL-decodes the token payload and reads its non-empty
string `oid` claim as the Entra Object ID. The identity is derived from `--access-token`. 
This decoding does not verify the token signature or validity.

### Option 1: Create a temporary ledger

After building, run from the repository root:

```bash
bash policy-engine/test/test.sh \
  --subscription "<subscription-id>" \
  --tenant "<tenant-id>" \
  --app-dir "$PWD/policy-engine" \
  --access-token "$ACCESS_TOKEN"
```

The script creates a randomly named `policy-engine-*` ledger and resource
group in `westeurope`, registers the token's Entra identity as Administrator,
waits for the ledger, deploys `dist/bundle.json`, configures roles and the
policy-admin user, and runs the tests. It uses API version `2026-02-23`.

**This creates billable Azure resources.** The script deletes the ledger and
resource group after the test phase, including when a policy test fails.
Setup failures stop immediately and do not trigger automatic cleanup; delete
any remaining resources identified in the script output.

### Option 2: Reuse an existing ledger

```bash
bash policy-engine/test/test.sh \
  --skip-ledger-creation \
  --ledger-name "<existing-ledger-name>" \
  --app-dir "$PWD/policy-engine" \
  --access-token "$ACCESS_TOKEN"
```

Neither `--subscription` nor `--tenant` is required in this mode. The script
does not create or delete Azure resources, but it still installs the
application, changes custom roles and the caller's role assignment, and writes
the test policy. Use a disposable test ledger, not a production ledger.

Display all options with:

```bash
bash policy-engine/test/test.sh --help
```

### Test coverage and results

The integration script checks:

1. Creation of `document-transfer-policy`, version `v1` (HTTP 204).
2. Evaluation with an approved document (`Allow`).
3. Evaluation with a pending document (`Deny`).
4. Evaluation with an empty document status (`Deny`).

Each test reports `[Pass]` or `[Fail]`. A failed policy test does not prevent
the remaining tests from running. After cleanup, the script prints
`Tests complete: N failed.` and exits nonzero if any test failed.

### Troubleshooting

- Build failure: confirm the supported Node.js version and run `npm install`
  in the sample directory.
- Missing bundle: run `npm run build` before invoking the test script and
  ensure `--app-dir` points to the sample directory.
- Token decoding failure: check jq/base64 availability and the token's `oid`
  claim. Obtain a fresh token for authentication failures.
- Deployment or role setup failure: verify the identity's ledger Administrator
  permissions and Azure resource permissions for new-ledger mode.
- Evaluation assertion failure: inspect the printed response body, verify the
  endpoint route, and check that it is exactly `Allow` or `Deny`.
- Interrupted or failed setup: inspect Azure for the ledger and resource group
  printed by the script and remove any temporary resources manually.

After testing, clear the token from your shell:

```bash
unset ACCESS_TOKEN
```
