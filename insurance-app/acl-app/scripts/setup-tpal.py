import argparse
import sys

parser = argparse.ArgumentParser()
parser.add_argument(
    "--tpal-tests-directory",
    type=str,
    help="Path to tpal tests to re-use that infrastructure.",
)
parser.add_argument(
    "--sandbox-common", type=str, help="Path to sandbox_common for workspace."
)
parser.add_argument(
    "--admin-cert", type=str, help="Path to pem encoded admin certificate."
)
parser.add_argument(
    "--admin-key", type=str, help="Path to pem encoded admin private key."
)
parser.description = "This script sets up a local TPAL instance similarly to one set up using the Azure portal."

if __name__ == "__main__":
    args = parser.parse_args()
    sys.path.append(args.tpal_tests_directory)
    import tester
    from ccf_client import Identity
    from programmability_test_helpers.programmability_test_setup import (
        CCFEndPointUserTest,
    )

    test_harness = CCFEndPointUserTest(
        args.sandbox_common,
        "2024-08-22-preview",
        [tester.CCFEndpoint("127.0.0.1", 8000, "0")],
    )

    # test_harness._setup_ledger()

    admin_cert_identity = Identity(
        key=args.admin_key, cert=args.admin_cert, description="admin id"
    )

    # Assign roles
    with tester.client_set(
        endpoints=test_harness.endpoints,
        network_cert_file=test_harness.ca,
        session_auth=test_harness._get_cert_identity(),
    ) as write_client:
        write_client.put(
            f"/app/roles?api-version={test_harness.api_version}",
            body={
                "roles": [
                    {
                        "role_name": "insuranceadmin",
                        "role_actions": ["/policy/write", "/processor/write"],
                    }
                ]
            },
            headers={"content-type": "application/json"},
        )

        admin_fingerprint = test_harness._format_cert_fingerprint(
            test_harness.admin_cert_fingerprint
        )

        write_client.patch(
            f"/app/ledgerUsers/{admin_fingerprint}?api-version={test_harness.api_version}",
            body={"assignedRoles": ["insuranceadmin"]},
            headers={"content-type": "application/merge-patch+json"},
        )
