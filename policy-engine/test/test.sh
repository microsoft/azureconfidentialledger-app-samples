#!/bin/bash
set -euo pipefail

apiVersion="2026-02-23"
ledgerId="policy-engine-"$(echo $RANDOM | md5sum | head -c 8; echo)
resourceGroup="$ledgerId-rg"
location="westeurope"
accessToken=""
tenantId=""
subscriptionId=""
ledgerType="Public"
administrator="Administrator"
tags="app=acl-policy-engine"
app_dir="" # application folder for reference
content_type_merge_path_json="application/merge-patch+json"
content_type_json="application/json"

only_status_code="-s -o /dev/null -w %{http_code}"

admin_role_actions='{"roles":[{"role_name":"policy-admin","role_actions":["/policy/action/write","/policy/action/delete","/policy/action/evaluate","/policy/action/get"]}]}'
user_role_actions='{"roles":[{"role_name":"user","role_actions":["/policy/action/evaluate","/policy/action/get"]}]}'
skip_ledger_creation=0
ledger_name=""
policyName="document-transfer-policy"
policyVersion="v1"

function usage {
    echo ""
    echo "Test this sample."
    echo ""
    echo "usage: ./test.sh [--subscription <subscriptionId> --tenant <tenantId>] --app-dir <application dir> --access-token <access token> [--skip-ledger-creation --ledger-name <ledger name>]"
    echo ""
    echo "  --subscription    string   The subscription id where the ledger resource will be deployed"
    echo "  --tenant          string   The tenant id"
    echo "  --app-dir         string   The application directory"
    echo "  --access-token    string   The access token of a user that has an Administrator role in the ledger"
    echo "  --skip-ledger-creation boolean  Optional. Use an existing ledger without creating or deleting Azure resources"
    echo "  --ledger-name     string   Required with --skip-ledger-creation. The existing ledger name"
    echo "                             --subscription and --tenant are only required when creating a ledger"
    echo ""
    exit 0
}

function failed {
    printf "💥 Script failed: %s\n\n" "$1"
    return 1
}

# parse parameters
while [ $# -gt 0 ]
do
    name="${1/--/}"
    case "--$name"  in
        --subscription) subscriptionId="$2"; shift;;
        --tenant) tenantId="$2"; shift;;
        --app-dir) app_dir="$2"; shift;;
        --access-token)
            if [ $# -lt 2 ] || [[ "$2" == --* ]] || [ -z "$2" ]; then
                failed "You must supply a value for --access-token"
            fi
            accessToken="$2"; shift;;
        --skip-ledger-creation) skip_ledger_creation=1;;
        --ledger-name)
            if [ $# -lt 2 ] || [[ "$2" == --* ]] || [ -z "$2" ]; then
                failed "You must supply a value for --ledger-name"
            fi
            ledger_name="$2"; shift;;
        --help) usage; exit 0;;
        --) shift;;
        *) failed "Unknown parameter: $1";;
    esac
    shift;
done

# validate parameters
if [ "$skip_ledger_creation" -eq 1 ]; then
    if [ -z "$ledger_name" ]; then
        failed "You must supply --ledger-name with --skip-ledger-creation"
    fi
    ledgerId="$ledger_name"
elif [ -n "$ledger_name" ]; then
    failed "--ledger-name requires --skip-ledger-creation"
fi
if [ "$skip_ledger_creation" -eq 0 ] && [ -z "$subscriptionId" ]; then
    failed "You must supply --subscription"
fi
if [ "$skip_ledger_creation" -eq 0 ] && [ -z "$tenantId" ]; then
    failed "You must supply --tenant"
fi
if [ -z "$accessToken" ]; then
    failed "You must supply --access-token"
fi
if [ -z "$app_dir" ]; then
    failed "You must supply --app-dir"
fi

command -v base64 >/dev/null || failed "base64 is required to decode --access-token"
command -v jq >/dev/null || failed "jq is required to read the access token's oid claim"
if [[ ! "$accessToken" =~ ^[^.]+\.([A-Za-z0-9_-]+={0,2})\.[^.]+$ ]]; then
    failed "--access-token must be a JWT with a Base64URL-encoded payload"
fi
token_payload="${BASH_REMATCH[1]}"
token_payload="${token_payload//-/+}"
token_payload="${token_payload//_/\/}"
case $((${#token_payload} % 4)) in
    0) ;;
    2) token_payload+="==";;
    3) token_payload+="=";;
    *) failed "--access-token has an invalid Base64URL payload";;
esac
if ! aadPrincipalId=$(printf '%s' "$token_payload" | base64 -d 2>/dev/null |
    jq -er 'if type == "object" then .oid | select(type == "string" and length > 0) else empty end' 2>/dev/null); then
    failed "--access-token must contain a valid JSON payload with a non-empty string oid claim"
fi

printf 'Entra Object ID (aadPrincipalId): %s\n' "$aadPrincipalId"

check_eq() {
    local expected="$1"
    local actual="$2"
    local message="$3"

    if [ "$expected" != "$actual" ]; then
        echo "❌ [Fail]: $message. $expected expected, but got $actual."
        exit 1
    fi
}

bundle="$app_dir/dist/bundle.json"

if [ "$skip_ledger_creation" -eq 0 ]; then
    # Create a resource group
    echo "Creating resource group $resourceGroup . . ."
    az group create -n $resourceGroup -l $location

    # Deploy an ACL instance
    # The user that is logged into Azure will become an Administrator automatically.
    echo "Creating Azure Confidential Ledger instance $ledgerId . . ."
    az confidentialledger create \
        --resource-group "$resourceGroup" \
        --ledger-name "$ledgerId" \
        --ledger-type "$ledgerType" \
        --ledger-sku Standard \
        --location "$location" \
        --aad-based-security-principals "[{principal-id:'${aadPrincipalId}',tenant-id:'${tenantId}',ledger-role-name:'${administrator}'}]" \
        --tags $tags
else
    echo "Using existing Azure Confidential Ledger instance $ledgerId . . ."
fi

# Wait until the resource is deployed
echo "💤 Waiting for the instance to be ready . . ."
while [ $(curl $only_status_code -k https://$ledgerId.confidential-ledger.azure.com/node/version) -ne 200 ]
do
    echo .
done

# Install the JS application
echo 'Installing the policy engine application . . .'
response_code=$(curl -k -X PUT "https://$ledgerId.confidential-ledger.azure.com/app/userDefinedEndpoints?api-version=$apiVersion" -H "Content-Type: $content_type_json" -d @$bundle -H "Authorization: Bearer $accessToken" $only_status_code)
check_eq 201 $response_code "App installation failed."

# Create custom roles
echo 'Creating application specific roles . . .'
echo $admin_role_actions
response_code=$(curl -k -X PUT "https://$ledgerId.confidential-ledger.azure.com/app/roles?api-version=$apiVersion" -H "Content-Type: $content_type_json" -d $admin_role_actions -H "Authorization: Bearer $accessToken" $only_status_code)
check_eq 200 $response_code "admin role creation failed."

echo $user_role_actions
response_code=$(curl -k -X PUT "https://$ledgerId.confidential-ledger.azure.com/app/roles?api-version=$apiVersion" -H "Content-Type: $content_type_json" -d $user_role_actions -H "Authorization: Bearer $accessToken" $only_status_code)
check_eq 200 $response_code "user role creation failed."

# Create application users and assign roles
echo 'Creating application users . . .'
policy_admin_user="{\"user_id\":\"$aadPrincipalId\",\"assignedRoles\":[\"policy-admin\"]}"
response_code=$(curl -k -X PATCH "https://$ledgerId.confidential-ledger.azure.com/app/ledgerUsers/$aadPrincipalId?api-version=$apiVersion" -H "Content-Type: $content_type_merge_path_json" -d $policy_admin_user -H "Authorization: Bearer $accessToken" $only_status_code)
check_eq 200 $response_code "policy admin user creation failed."

echo 'Running tests . . .'

test_failures=0

run_test() {
    local name="$1"
    local status
    shift
    # Keep errexit active inside each test without stopping the test runner.
    set +e
    (
        set -e
        "$@"
    )
    status=$?
    set -e
    if [ "$status" -eq 0 ]; then
        printf '[Pass]: %s\n' "$name"
    else
        printf '[Fail]: %s (exit %s)\n' "$name" "$status" >&2
        test_failures=$((test_failures + 1))
    fi
}

# Test data
document_transfer_policy_v1='{"rule":{"if":[{"and":[{"==":[{"var":"operation"},"transfer"]},{"==":[{"var":"document.status"},"approved"]}]},"Allow","Deny"]}}'
policy_input_allow='{"input":{"operation":"transfer","document":{"status":"approved"}}}'
policy_input_deny_1='{"input":{"operation":"transfer","document":{"status":"pending"}}}'
policy_input_deny_2='{"input":{"operation":"transfer","document":{"status":""}}}'

# Create a policy
create_policy() {
response_code=$(curl -k -X PUT "https://$ledgerId.confidential-ledger.azure.com/policy/$policyName/$policyVersion/create?api-version=$apiVersion" -d $document_transfer_policy_v1 -H "Authorization: Bearer $accessToken" $only_status_code)
check_eq 204 "$response_code" "policy creation failed."
}
run_test "policy creation" create_policy

# Evaluate the policy against an allow input
evaluate_allow() {
response=$(curl -k -X POST "https://$ledgerId.confidential-ledger.azure.com/policy/$policyName/$policyVersion/evaluate?api-version=$apiVersion" -d $policy_input_allow -H "Authorization: Bearer $accessToken")
printf '[Response from evaluate_allow()]: %s\n' "$response"
check_eq "Allow" "$response" "allow policy evaluation failed."
}
run_test "allow policy evaluation" evaluate_allow

# Evaluate the policy against a deny input
evaluate_deny_pending() {
response=$(curl -k -X POST "https://$ledgerId.confidential-ledger.azure.com/policy/$policyName/$policyVersion/evaluate?api-version=$apiVersion" -d $policy_input_deny_1 -H "Authorization: Bearer $accessToken")
printf '[Response from evaluate_deny_pending()]: %s\n' "$response"
check_eq "Deny" "$response" "deny policy evaluation failed."
}
run_test "deny policy evaluation (pending status)" evaluate_deny_pending

# Evaluate the policy against a second deny input
evaluate_deny_empty() {
response=$(curl -k -X POST "https://$ledgerId.confidential-ledger.azure.com/policy/$policyName/$policyVersion/evaluate?api-version=$apiVersion" -d $policy_input_deny_2 -H "Authorization: Bearer $accessToken")
printf '[Response from evaluate_deny_empty()]: %s\n' "$response"
check_eq "Deny" "$response" "deny policy evaluation failed."
}
run_test "deny policy evaluation (empty status)" evaluate_deny_empty

echo "-- Cleaning up . . ."
if [ "$skip_ledger_creation" -eq 0 ]; then
    az confidentialledger delete -y -n $ledgerId -g $resourceGroup
    az group delete --yes -n $resourceGroup
fi

printf 'Tests complete: %s failed.\n' "$test_failures"
if [ "$test_failures" -gt 0 ]; then
    exit 1
fi