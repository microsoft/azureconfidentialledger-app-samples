import argparse
import json
import httpx
import tempfile
import base64


import crypto

import unit_test_constants


def hex_to_base64(hex_str):
    # Convert the hex string to bytes
    decoded_bytes = bytes.fromhex(hex_str)

    # Encode the bytes to a base64 string
    base64_str = base64.b64encode(decoded_bytes).decode("utf-8")

    return base64_str


class HTTPXClient:
    def __init__(self, acl_url, session_auth):
        self.acl_url = acl_url
        self.session_auth = session_auth
        self.session = httpx.Client(verify=False, cert=session_auth)

    def get(self, path, *args, **kwargs) -> httpx.Response:
        return self.session.request("GET", url=self.acl_url + path, *args, **kwargs)

    def put(self, path, *args, **kwargs) -> httpx.Response:
        return self.session.request("PUT", url=self.acl_url + path, *args, **kwargs)

    def post(self, path, *args, **kwargs) -> httpx.Response:
        return self.session.request("POST", url=self.acl_url + path, *args, **kwargs)

    def patch(self, path, *args, **kwargs) -> httpx.Response:
        return self.session.request("PATCH", url=self.acl_url + path, *args, **kwargs)


USER_POLICY = "This policy covers all claims."
USER_INCIDENT = "The policyholder hit another car."

parser = argparse.ArgumentParser()
parser.add_argument("--admin-cert", type=str, help="Path to ACL admin certificate.")
parser.add_argument("--admin-key", type=str, help="Path to ACL admin private key.")
parser.add_argument("--bundle", type=str, help="Path to app bundle.json")
parser.add_argument("--acl-url", type=str, default="https://localhost:8000")
parser.add_argument("--api-version", type=str, default="2024-08-22-preview")

if __name__ == "__main__":
    args = parser.parse_args()

    admin_identity = (args.admin_cert, args.admin_key)
    admin_client = HTTPXClient(args.acl_url, admin_identity)

    print("Creating client")
    client_keypath, client_certpath = crypto.generate_or_read_cert()
    client_identity = client_certpath, client_keypath
    client_client = HTTPXClient(args.acl_url, client_identity)

    print("Creating processor")
    processor_keypath, processor_certpath = None, None
    with tempfile.NamedTemporaryFile(
        "wb", delete=False, suffix=".pem"
    ) as certfile, tempfile.NamedTemporaryFile(
        "wb", delete=False, suffix=".pem"
    ) as keyfile:
        cert = base64.b64decode(unit_test_constants.processor_cert)
        certfile.write(cert)
        certfile.flush()
        processor_certpath = certfile.name
        key = base64.b64decode(unit_test_constants.processor_privk)
        keyfile.write(key)
        keyfile.flush()
        processor_keypath = keyfile.name
    processor_identity = processor_certpath, processor_keypath
    processor_client = HTTPXClient(args.acl_url, processor_identity)

    # ---- Upload bundle ----
    module_name = "insurance_app.js"
    bundle = json.loads(open(args.bundle).read())

    signed_bundle = crypto.sign_payload(
        (args.admin_cert, args.admin_key), "userDefinedEndpoints", bundle
    )
    resp = httpx.put(
        f"{args.acl_url}/app/userDefinedEndpoints?api-version={args.api_version}",
        data=signed_bundle,
        headers={"content-type": "application/cose"},
        verify=False,
    )
    assert resp.status_code in {200, 201}, (resp.status_code, resp.text)
    print("Uploaded app as cose signed bundle.")

    # ---- Adding InsuranceAdmin role ----
    print("Adding ACL roles")
    resp = admin_client.put(
        f"/app/roles?api-version={args.api_version}",
        json={
            "roles": [
                {
                    "role_name": "InsuranceAdmin",
                    "role_actions": ["/policy/write", "/processor/write"],
                }
            ]
        },
    )
    assert resp.status_code == 200 or (
        resp.status_code == 400 and resp.json()["error"]["code"] == "RoleExists"
    ), (resp.status_code, resp.text)

    # ---- Registering admin as InsuranceAdmin ----
    resp = admin_client.get("/app/ccf-cert")
    assert resp.status_code == 200
    admin_fingerprint = resp.text

    resp = admin_client.patch(
        f"/app/ledgerUsers/{admin_fingerprint}?api-version={args.api_version}",
        json={"assignedRoles": ["InsuranceAdmin"]},
        headers={"content-type": "application/merge-patch+json"},
    )
    assert resp.status_code == 200, (resp.status_code, resp.text)

    # ---- Register valid policy ----
    print("Setting processor policy")
    target_policy = {
        "policies": [hex_to_base64(unit_test_constants.processor_policy)],
    }
    resp = admin_client.put(
        "/app/processor/policy",
        json=target_policy,
    )
    assert (
        resp.status_code == 200
    ), f"Failed to set processor policy: {resp.status_code} {resp.text}"

    # ---- Register processor ----
    print("Registering processor")
    resp = processor_client.put(
        "/app/processor",
        json=unit_test_constants.processor_registration_request,
    )
    assert (
        resp.status_code == 200
    ), f"Failed to register processor: {resp.status_code} {resp.text}"

    # ---- Client registration ----
    print("Registering client")
    resp = client_client.get("/app/ccf-cert")
    assert resp.status_code == 200
    client_fingerprint = resp.text

    resp = admin_client.put(
        "/app/user",
        json={"cert": client_fingerprint, "policy": USER_POLICY},
        headers={"content-type": "application/json"},
    )
    assert (
        resp.status_code == 200
    ), f"Failed to set client policy: {resp.status_code} {resp.text}"

    # ---- Client incident processing ----

    # Client registers case
    print("Registering case")
    resp = client_client.post("/app/cases", data=USER_INCIDENT)
    assert resp.status_code == 200, "Failed to register case"
    caseId = int(resp.text)

    expected_pre_decision_case_metadata = {
        "incident": "The policyholder hit another car.",
        "policy": "This policy covers all claims.",
        "decision": {"decision": "", "processor_fingerprint": ""},
    }

    # Processor requests case and processes it
    print("Getting decision")
    resp = processor_client.get("/app/cases/next")
    assert (
        resp.status_code == 200
        and resp.json()["caseId"] == caseId
        and resp.json()["metadata"] == expected_pre_decision_case_metadata
    ), f"{resp.status_code} {resp.text}"

    # Requesting another case returns current one
    resp = processor_client.get("/app/cases/next")
    assert (
        resp.status_code == 200
        and resp.json()["metadata"] == expected_pre_decision_case_metadata
    )

    # No decision while processing
    resp = client_client.get(f"/app/cases/indexed/{caseId}")
    assert (
        resp.status_code == 200
        and resp.json()["metadata"]["decision"]["decision"] == ""
    ), f"{resp.status_code} {resp.text}"

    # Processor stores decision
    print("Storing decision")
    resp = processor_client.post(
        f"/app/cases/indexed/{caseId}/decision",
        json={
            "incident": USER_INCIDENT,
            "policy": USER_POLICY,
            "decision": "approve",
        },
        # headers={"content-type": "application/json"},
    )
    assert (
        resp.status_code == 200
    ), f"Failed to store decision: {resp.status_code} {resp.text}"

    # Client can retrieve the case
    print("Retrieving decision")
    resp = client_client.get(f"/app/cases/indexed/{caseId}")
    assert (
        resp.status_code == 200
    ), f"failed to retrieve case: {resp.status_code} {resp.text}"

    assert resp.json()["metadata"]["decision"]["decision"] == "approve"

    print("Unit test successful")
