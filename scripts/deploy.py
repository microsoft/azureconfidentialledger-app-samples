import os
import argparse

from OpenSSL.crypto import load_certificate, FILETYPE_PEM

from ccf_client.log_capture import flush_info
import ccf_client

from collections.abc import Iterable

from http import HTTPStatus

import json

set_builtin_roles_proposal = {
        "actions": [
            {
                "name": "set_builtin_roles_actions",
                "args": {
                    "roles": [
                        {
                            "rolename": "administrator",
                            "actions": [
                                "Microsoft.ConfidentialLedger/ledger/governance/constitution/read",
                                "Microsoft.ConfidentialLedger/ledger/governance/members/read",
                                "Microsoft.ConfidentialLedger/ledger/enclaves/read",
                                "Microsoft.ConfidentialLedger/ledger/append",
                                "Microsoft.ConfidentialLedger/ledger/read",
                                "Microsoft.ConfidentialLedger/ledger/historicalQuery",
                                "Microsoft.ConfidentialLedger/ledger/receipts/read",
                                "Microsoft.ConfidentialLedger/ledger/transactions/status/read",
                                "Microsoft.ConfidentialLedger/ledger/collections/read",
                                "Microsoft.ConfidentialLedger/ledger/subLedgerIds/read",
                                "Microsoft.ConfidentialLedger/ledger/users/readall",
                                "Microsoft.ConfidentialLedger/ledger/users/read",
                                "Microsoft.ConfidentialLedger/ledger/users/write",
                                "Microsoft.ConfidentialLedger/ledger/users/delete",
                                "Microsoft.ConfidentialLedger/ledger/roleDefinitions/read",
                                "Microsoft.ConfidentialLedger/ledger/roleDefinitions/write",
                                "Microsoft.ConfidentialLedger/ledger/roleDefinitions/delete",
                                "Microsoft.ConfidentialLedger/ledger/endpoints/write",
                                "Microsoft.ConfidentialLedger/ledger/endpoints/read"
                            ]
                        },
                        {
                            "rolename":"contributor",
                            "actions":[
                                "Microsoft.ConfidentialLedger/ledger/append",
                                "Microsoft.ConfidentialLedger/ledger/governance/constitution/read",
                                "Microsoft.ConfidentialLedger/ledger/governance/members/read",
                                "Microsoft.ConfidentialLedger/ledger/enclaves/read",
                                "Microsoft.ConfidentialLedger/ledger/read",
                                "Microsoft.ConfidentialLedger/ledger/historicalQuery",
                                "Microsoft.ConfidentialLedger/ledger/receipts/read",
                                "Microsoft.ConfidentialLedger/ledger/transactions/status/read",
                                "Microsoft.ConfidentialLedger/ledger/collections/read",
                                "Microsoft.ConfidentialLedger/ledger/subLedgerIds/read",
                                "Microsoft.ConfidentialLedger/ledger/users/readall",
                                "Microsoft.ConfidentialLedger/ledger/users/read",
                                "Microsoft.ConfidentialLedger/ledger/roleDefinitions/read"
                            ]
                        },
                        {
                            "rolename":"reader",
                            "actions":[
                                "Microsoft.ConfidentialLedger/ledger/governance/constitution/read",
                                "Microsoft.ConfidentialLedger/ledger/governance/members/read",
                                "Microsoft.ConfidentialLedger/ledger/enclaves/read",
                                "Microsoft.ConfidentialLedger/ledger/read",
                                "Microsoft.ConfidentialLedger/ledger/historicalQuery",
                                "Microsoft.ConfidentialLedger/ledger/receipts/read",
                                "Microsoft.ConfidentialLedger/ledger/transactions/status/read",
                                "Microsoft.ConfidentialLedger/ledger/collections/read",
                                "Microsoft.ConfidentialLedger/ledger/subLedgerIds/read",
                                "Microsoft.ConfidentialLedger/ledger/users/readall",
                                "Microsoft.ConfidentialLedger/ledger/users/read",
                                "Microsoft.ConfidentialLedger/ledger/roleDefinitions/read"
                            ]
                        }
                    ]
                }
            }
        ]
    }

def set_user_data_to_admin_proposal(fingerprint):
    return {
        "actions": [
            {
                "name": "set_user_data",
                "args": {
                    "user_id": fingerprint,
                    "user_data": {
                        "roleName": "administrator"
                    }
                }
            }
        ]
    }

class TestRig:
    def __init__(self, ccf_common, api_version, host, port):
        self.service_ca = os.path.join(ccf_common, "service_cert.pem")

        member_cert  = os.path.join(ccf_common, "member0_cert.pem")
        member_privk = os.path.join(ccf_common, "member0_privk.pem")

        self.member_identity = ccf_client.Identity(
            key = member_privk, cert=member_cert, description = "Member ID"
        )

        admin_cert = os.path.join(ccf_common, "user0_cert.pem")
        admin_privk = os.path.join(ccf_common, "user0_privk.pem")

        self.admin_identity = ccf_client.Identity(
            key = admin_privk, cert=admin_cert, description = "Admin ID"
        )
        with open(admin_cert, 'r') as file:
            self.admin_fingerprint = self._generate_fingerprint(file.read())

        self.host = host
        self.port = port
        self.api_version = api_version

    def _generate_fingerprint(self, cert):
        read_cert = load_certificate(FILETYPE_PEM, cert)
        fingerprint = read_cert.digest("sha256").decode()
        truncated_fingerprint = fingerprint.replace(":", "")
        return truncated_fingerprint.lower()

    def _propose_ballot(self, client, proposal):
        headers = {"content-type": "application/json"}
        response = client.post("/gov/proposals", body=proposal, headers=headers)
        if response.body.json()['state'] == "Accepted":
            return

        proposal_id = response.body.json()["proposal_id"]
        ballot = {
            "ballot": "export function vote (raw_proposal, proposer_id) { return true; }"
        }
        client.post(
            f"/gov/proposals/{proposal_id}/ballots",
            body=ballot
        )

    def setup_ledger(self):
        try:
            flush_info(["setting up ledger"])
            member_client = self.get_client(session_auth=self.member_identity, cose_signing_auth=self.member_identity)

            flush_info(["Adding builtin roles"])
            self._propose_ballot(member_client, set_builtin_roles_proposal)

            flush_info(["Adding admin (user0.cert etc)"])
            self._propose_ballot(member_client, set_user_data_to_admin_proposal(self.admin_fingerprint))

            flush_info(["Skipping JWT admin and JWT principal"])

            flush_info(["Ledger setup complete"])

        except Exception as e:
            flush_info([f"Error during ledger setup: {e}"])
            raise

    def get_client(self, **kwargs):
        return ccf_client.CCFClient(
            self.host, self.port, self.service_ca, **kwargs
        )

def verify_response(response, expected_status):
    if isinstance(expected_status, Iterable):
        assert(response.status_code in expected_status)
    else:
        assert(response.status_code == expected_status)

    return response

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('ccf_common', help='ccf_common directory')
    parser.add_argument('--setup', action='store_true', default=False, help='Set up the ledger')
    parser.add_argument('--host', default="127.0.0.1:8000", help="CCF hostname")
    parser.add_argument('--api-version', default='2024-08-22-preview', help="API version")
    def valid_path(path):
        return path if os.path.isfile(path) else argparse.ArgumentTypeError(f"File not found: {path}")
    parser.add_argument('--metadata', type=valid_path, default=None, help="Path to app.json")
    parser.add_argument('--module', nargs='+', type=valid_path, help="Paths to modules.")
    parser.add_argument('--bundle', type=valid_path, default=None, help="Path to bundle.")
    parser.add_argument('-d', '--debug', action='store_true', default=False, help='set js_runtime_args to log output')
    args = parser.parse_args()

    [host, port] = args.host.split(':')

    flush_info([f"Connecting to {host}:{port}"])

    tester = TestRig(args.ccf_common, args.api_version, host, port)

    if args.setup:
        tester.setup_ledger()

    admin_client = tester.get_client(session_auth=tester.admin_identity)

    if args.debug:
        admin_client.patch(
            f"/app/userDefinedEndpoints/runtimeOptions?api-version={args.api_version}", 
            body={'log_exception_details': True, 'return_exception_details': True})

    bundle = None
    if args.metadata and args.module:
        with open(args.metadata) as fp:
            metadata = json.load(fp)
        modules = []
        for path in args.module:
            with open(path) as fp:
                modules.append({   
                    "name": path,
                    "module": fp.read(),
                })
        bundle = {
            "metadata": metadata,
            "modules": modules,
        }
    elif args.bundle:
        with open(args.bundle) as fp:
            bundle = json.load(fp)

    json_headers = {"content-type": "application/json"}
    verify_response(
        admin_client.put(
            f"/app/userDefinedEndpoints?api-version={args.api_version}",
            body=bundle, headers=json_headers),
        HTTPStatus.CREATED)