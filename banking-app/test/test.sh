#!/bin/bash
set -euo pipefail

ledger=""
certificate_dir=""
manager_cert="manager_cert.pem"
manager_privk="manager_privk.pem"
teller_cert="teller_cert.pem"
teller_privk="teller_privk.pem"

function usage {
    echo ""
    echo "Test this sample."
    echo ""
    echo "usage: ./test.sh --ledger <ledger url> --cert-dir <certificate directory>"
    echo ""
    echo "  --ledger     string      The Azure Confidential Ledger instance endpoint"
    echo "  --cert-dir   string      The directory where the user certificates are located"
    echo ""
    exit 0
}

function failed {
    printf "💥 Script failed: %s\n\n" "$1"
    exit 1
}

# parse parameters
if [ $# -gt 4 ]; then
    usage
    exit 1
fi

while [ $# -gt 0 ]
do
    name="${1/--/}"
    name="${name/-/_}"
    case "--$name"  in
        --ledger) ledger="$2"; shift;;
        --cert_dir) certificate_dir="$2"; shift;;
        --help) usage; exit 0;;
        --) shift;;
    esac
    shift;
done

# validate parameters
if [ -z "$ledger" ]; then
    failed "You must supply --ledger"
fi
if [ -z "$certificate_dir" ]; then
    failed "You must supply --certificate_dir"
fi

manager_cert_auth="--cert $certificate_dir/$manager_cert --key $certificate_dir/$manager_privk"
teller_cert_auth="--cert $certificate_dir/$teller_cert --key $certificate_dir/$teller_privk"

echo "📂 Working directory (for certificates): ${certificate_dir}"

check_eq() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"
    if [ "$expected" == "$actual" ]; then
        echo "✅ [Pass]: $test_name" 
    else
        echo "❌ [Fail]: $test_name: $expected expected, but got $actual."
        exit 1
    fi
}

only_status_code="-s -o /dev/null -w %{http_code}"

# Only when this directory has been created (or refreshed), should we change to it
# otherwise you can get permission issues.
cd "${certificate_dir}"

account1="account1"
account2="account2"
account3="account3"

# -------------------------- Test cases --------------------------
echo "Test start"

# Test normal usage
check_eq "Create account: account1" "204" "$(curl -k -X PUT $ledger/app/account/$account1 $manager_cert_auth $only_status_code)"
check_eq "Create account: account2" "204" "$(curl -k $ledger/app/account/$account2 -X PUT $manager_cert_auth $only_status_code)"
check_eq "Deposit: account1, 100" "204" "$(curl -k $ledger/app/deposit/$account1 -X POST -H "Content-Type: application/json" $teller_cert_auth --data-binary '{ "value": 100 }' $only_status_code)"
check_eq "Transfer: 40 from account1 to account2" "204" "$(curl -k $ledger/app/transfer/$account1 -X POST -H "Content-Type: application/json" $teller_cert_auth --data-binary "{ \"value\": 40, \"account_name_to\": \"$account2\" }" $only_status_code)"
check_eq "Balance: account1" "{\"balance\":60}" "$(curl -k $ledger/app/balance/$account1 -X GET $manager_cert_auth -s)"
check_eq "Balance: account2" "{\"balance\":40}" "$(curl -k $ledger/app/balance/$account2 -X GET $teller_cert_auth -s)"

# Test cases for error handling and corner cases
check_eq "Create account: account3" "400" "$(curl -k $ledger/app/account/$account3 -X PUT $teller_cert_auth $only_status_code)"
check_eq "Deposit: invalid value (non integer 2)" "400" "$(curl -k $ledger/app/deposit/$account1 -X POST -H "Content-Type: application/json" $teller_cert_auth --data-binary '{ "value": 100.5 }' $only_status_code)"
check_eq "Deposit: invalid value (zero)" "400" "$(curl -k $ledger/app/deposit/$account1 -X POST -H "Content-Type: application/json" $teller_cert_auth --data-binary '{ "value": 0 }' $only_status_code)"
check_eq "Deposit: invalid value (negative value)" "400" "$(curl -k $ledger/app/deposit/$account1 -X POST -H "Content-Type: application/json" $teller_cert_auth --data-binary '{ "value": -100 }' $only_status_code)"
check_eq "Transfer: not enough balance" "400" "$(curl -k $ledger/app/transfer/$account1 -X POST -H "Content-Type: application/json" $teller_cert_auth --data-binary "{ \"value\": 140, \"account_name_to\": \"$account2\" }" $only_status_code)"
check_eq "Transfer: invalid value (non integer 1)" "400" "$(curl -k $ledger/app/transfer/$account1 -X POST -H "Content-Type: application/json" $teller_cert_auth --data-binary "{ \"value\": abc, \"account_name_to\": \"$account2\" }" $only_status_code)"
check_eq "Transfer: invalid value (non integer 2)" "400" "$(curl -k $ledger/app/transfer/$account1 -X POST -H "Content-Type: application/json" $teller_cert_auth --data-binary "{ \"value\": 100.5, \"account_name_to\": \"$account2\" }" $only_status_code)"
check_eq "Transfer: invalid value (zero)" "400" "$(curl -k $ledger/app/transfer/$account1 -X POST -H "Content-Type: application/json" $teller_cert_auth --data-binary "{ \"value\": 0, \"account_name_to\": \"$account2\" }" $only_status_code)"
check_eq "Transfer: invalid value (negative value)" "400" "$(curl -k $ledger/app/transfer/$account1 -X POST -H "Content-Type: application/json" $teller_cert_auth --data-binary "{ \"value\": -100, \"account_name_to\": \"$account2\" }" $only_status_code)"
check_eq "Transfer: accountTo not found" "404" "$(curl -k $ledger/app/transfer/$account1 -X POST -H "Content-Type: application/json" $teller_cert_auth --data-binary "{ \"value\": 140, \"account_name_to\": \"account_not_exist\" }" $only_status_code)"
check_eq "Balance: account not found" "404" "$(curl -k $ledger/app/balance/invalid_account $teller_cert_auth $only_status_code)"

printf "\n\n🏁 Test Completed...\n"
exit 0
