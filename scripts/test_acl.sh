#!/bin/bash
set -euo pipefail

apiVersion="2024-12-09-preview"
ledgerId="banking-app-"$(echo $RANDOM | md5sum | head -c 8; echo)
resourceGroup="$ledgerId-rg"
location="westeurope"
aadPrincipalId=""
tenantId=""
subscriptionId=""
ledgerType="Public"
administrator="Administrator"
tags="sample=acl app=banking"
manager="manager"
teller="teller"
manager_cert="$manager"_cert.pem
manager_privk="$manager"_privk.pem
teller_cert="$teller"_cert.pem
teller_privk="$teller"_privk.pem
curve="secp384r1"
app_dir="" # application folder for reference
cert_dir="/tmp/$ledgerId"
content_type_merge_path_json="application/merge-patch+json"
content_type_json="application/json"

only_status_code="-s -o /dev/null -w %{http_code}"

manager_role_actions='{"roles":[{"role_name":"manager","role_actions":["/banking/accounts/post","/banking/accounts/put","/banking/accounts/get","/banking/accounts/patch"]}]}'
teller_role_actions='{"roles":[{"role_name":"teller","role_actions":["/banking/accounts/put","/banking/accounts/get","/banking/accounts/patch"]}]}'
interactive=0

function usage {
    echo ""
    echo "Test this sample."
    echo ""
    echo "usage: ./test_acl.sh --subscription <subscriptionId> --tenant <tenantId> --app-dir <application dir> [--interactive]"
    echo ""
    echo "  --subscription    string   The subscription id where the ledger resource will be deployed"
    echo "  --tenant          string   The tenant id"
    echo "  --app-dir         string   The application directory"
    echo "  --interactive     boolean  Optional. Run in Demo mode"
    echo ""
    exit 0
}

function failed {
    printf "💥 Script failed: %s\n\n" "$1"
    exit 1
}

# parse parameters
if [ $# -gt 7 ]; then
    usage
    exit 1
fi

while [ $# -gt 0 ]
do
    name="${1/--/}"
    name="${name/-/_}"
    case "--$name"  in
        --subscription) subscriptionId="$2"; shift;;
        --tenant) tenantId="$2"; shift;;
        --app_dir) app_dir="$2"; shift;;
        --interactive) interactive=1;;
        --help) usage; exit 0;;
        --) shift;;
    esac
    shift;
done

# validate parameters
if [ -z "$subscriptionId" ]; then
    failed "You must supply --subscription"
fi
if [ -z "$tenantId" ]; then
    failed "You must supply --tenant"
fi

check_eq() {
    local expected="$1"
    local actual="$2"
    local message="$3"

    if [ "$expected" != "$actual" ]; then
        echo "❌ [Fail]: $message. $expected expected, but got $actual."
        exit 1
    fi
}

if [ ! -d "$cert_dir" ]; then
    mkdir -p "$cert_dir"
fi

bundle="$app_dir/dist/bundle.json"

# Generate certificates
echo "-- Generating identity private key and certificate for manager..."

openssl ecparam -out "$cert_dir/$manager_privk" -name "$curve" -genkey
openssl req -new -key "$cert_dir/$manager_privk" -x509 -nodes -days 365 -out "$cert_dir/$manager_cert" -sha384 -subj=/CN="$manager"

echo "-- Generating identity private key and certificate for teller..."

openssl ecparam -out "$cert_dir/$teller_privk" -name "$curve" -genkey
openssl req -new -key "$cert_dir/$teller_privk" -x509 -nodes -days 365 -out "$cert_dir/$teller_cert" -sha384 -subj=/CN="$teller"

manager_cert_fingerprint=$(openssl x509 -in "$cert_dir/$manager_cert" -noout -fingerprint -sha256 | cut -d "=" -f 2)
teller_cert_fingerprint=$(openssl x509 -in "$cert_dir/$teller_cert" -noout -fingerprint -sha256 | cut -d "=" -f 2)

manager_user="{\"user_id\":\"$manager_cert_fingerprint\",\"assignedRoles\":[\"manager\",\"administrator\"]}"
teller_user="{\"user_id\":\"$teller_cert_fingerprint\",\"assignedRoles\":[\"teller\"]}"

# Create a resource group
echo "Creating resource group $resourceGroup . . ."
az group create -n $resourceGroup -l $location

# Deploy an ACL instance
# The user that is logged into Azure will become an Administrator automatically.
echo "Creating Azure Confidential Ledger instance $ledgerId . . ."
certSecurityPrincipal=$(awk 'NF { sub(/\r/, ""); printf "%s", $0 }' "$cert_dir/$manager_cert")
certBasedSecurityPrincipals="[{cert:'${certSecurityPrincipal}',ledger-role-name:'${administrator}'}]"
az confidentialledger create \
    --resource-group "$resourceGroup" \
    --ledger-name "$ledgerId" \
    --ledger-type "$ledgerType" \
    --ledger-sku Standard \
    --location "$location" \
    --cert-based-security-principals "$certBasedSecurityPrincipals" \
    --tags $tags

# Wait until the resource is deployed
echo "💤 Waiting for the instance to be ready . . ."
while [ $(curl $only_status_code -k https://$ledgerId.confidential-ledger.azure.com/node/version) -ne 200 ]
do
    echo .
done

# Install the JS application
echo '-- Installing the banking application . . .'
response_code=$(curl -k -X PUT "https://$ledgerId.confidential-ledger.azure.com/app/userDefinedEndpoints?api-version=$apiVersion" -H "Content-Type: $content_type_json" -d @$bundle --cert "$cert_dir/$manager_cert" --key "$cert_dir/$manager_privk" $only_status_code)
check_eq 201 $response_code "App installation failed."

# Create custom roles
echo '-- Creating application specific roles . . .'
echo $manager_role_actions
response_code=$(curl -k -X PUT "https://$ledgerId.confidential-ledger.azure.com/app/roles?api-version=$apiVersion" -H "Content-Type: $content_type_json" -d $manager_role_actions --cert "$cert_dir/$manager_cert" --key "$cert_dir/$manager_privk" $only_status_code)
check_eq 200 $response_code "manager role creation failed."

response_code=$(curl -k -X PUT "https://$ledgerId.confidential-ledger.azure.com/app/roles?api-version=$apiVersion" -H "Content-Type: $content_type_json" -d $teller_role_actions --cert "$cert_dir/$manager_cert" --key "$cert_dir/$manager_privk" $only_status_code)
check_eq 200 $response_code "teller role creation failed."

# Create application users and assign roles
echo '-- Creating application users . . .'
response_code=$(curl -k -X PATCH "https://$ledgerId.confidential-ledger.azure.com/app/ledgerUsers/$manager_cert_fingerprint?api-version=$apiVersion" -H "Content-Type: $content_type_merge_path_json" -d $manager_user --cert "$cert_dir/$manager_cert" --key "$cert_dir/$manager_privk" $only_status_code)
check_eq 200 $response_code "manager user creation failed."

response_code=$(curl -k -X PATCH "https://$ledgerId.confidential-ledger.azure.com/app/ledgerUsers/$teller_cert_fingerprint?api-version=$apiVersion" -H "Content-Type: $content_type_merge_path_json" -d $teller_user --cert "$cert_dir/$manager_cert" --key "$cert_dir/$manager_privk" $only_status_code)
check_eq 200 $response_code "teller user creation failed."

echo '-- Running tests . . .'
testScript="$app_dir/test/test.sh"
if [ ! -f "$testScript" ]; then
    echo "💥📂 Test file $testScript not found."
    exit 1
fi

# build testScript command
testScript="${testScript} --ledger https://${ledgerId}.confidential-ledger.azure.com --cert-dir ${cert_dir}"
if [ $interactive -eq 1 ]; then
    testScript="${testScript} --interactive"
fi

# call testScript command
${testScript}

echo "-- Cleaning up . . ."
az confidentialledger delete -y -n $ledgerId -g $resourceGroup
az group delete --yes -n $resourceGroup
rm -r $cert_dir



