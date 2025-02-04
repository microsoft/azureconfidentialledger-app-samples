
import argparse
import json
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
    "--bundle", type=str, help="Path to bundle."
)
parser.description = "This script uploads the bundle using the TPAL test setup"

if __name__ == "__main__":
    args = parser.parse_args()
    sys.path.append(args.tpal_tests_directory)
    import tester
    from programmability_test_helpers.programmability_test_setup import (
        CCFEndPointUserTest,
    )

    test_harness = CCFEndPointUserTest(
        args.sandbox_common,
        "2024-08-22-preview",
        [tester.CCFEndpoint("127.0.0.1", 8000, "0")],
    )

    admin_cert_identity = test_harness._get_cert_identity()

    module_name = "auth_test.js"
    bundle = json.loads(open(args.bundle).read())

    admin_cert_identity = test_harness._get_cert_identity()

    # Bundle
    signed_bundle = test_harness._sign_payload(
        admin_cert_identity, "userDefinedEndpoints", bundle
    )
    with tester.client_set(
        endpoints=test_harness.endpoints,
        network_cert_file=test_harness.ca,
    ) as cose_installer:
        r = cose_installer.put(
            f"/app/userDefinedEndpoints?api-version={test_harness.api_version}",
            body=signed_bundle,
            headers={"content-type": "application/cose"},
        )
        assert r.status_code in {200, 201}