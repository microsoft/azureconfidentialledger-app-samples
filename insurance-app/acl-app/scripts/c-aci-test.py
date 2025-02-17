import argparse
import json
import httpx

import time

import crypto
import base64


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
parser.add_argument(
    "--valid-processor-policy", type=str, help="Hex encoded processor policy."
)
parser.add_argument("--acl-url", type=str, default="https://localhost:8000")
parser.add_argument("--api-version", type=str, default="2024-08-22-preview")

if __name__ == "__main__":
    args = parser.parse_args()

    admin_identity = (args.admin_cert, args.admin_key)
    admin_client = HTTPXClient(args.acl_url, admin_identity)

    client_keypath, client_certpath = crypto.generate_or_read_cert()
    client_identity = client_certpath, client_keypath
    client_client = HTTPXClient(args.acl_url, client_identity)

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
    print("Creating InsuranceAdmin role.")
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
    assert resp.status_code == 200, (resp.status_code, resp.text)
    admin_fingerprint = resp.text
    print(f"Adding {admin_fingerprint} as a InsuranceAdmin.")

    resp = admin_client.patch(
        f"/app/ledgerUsers/{admin_fingerprint}?api-version={args.api_version}",
        json={"assignedRoles": ["InsuranceAdmin"]},
        headers={"content-type": "application/merge-patch+json"},
    )
    assert resp.status_code == 200, (resp.status_code, resp.text)

    # ---- Register valid policy ----
    print(f"Setting valid policy as: {args.valid_processor_policy}.")
    policy_b64 = hex_to_base64(args.valid_processor_policy)
    resp = admin_client.put(
        "/app/processor/policy",
        json={
            "policies": [policy_b64],
        },
        headers={"content-type": "application/json"},
    )
    assert (
        resp.status_code == 200
    ), f"Failed to set processor policy: {resp.status_code} {resp.text} | {resp.request.text}"

    # ---- Client registration ----
    resp = client_client.get("/app/ccf-cert")
    assert resp.status_code == 200, (resp.status_code, resp.text)
    client_fingerprint = resp.text

    policy = input("Enter client policy: ")
    resp = admin_client.put(
        "/app/user",
        json={"cert": client_fingerprint, "policy": policy},
        headers={"content-type": "application/json"},
    )
    assert (
        resp.status_code == 200
    ), f"Failed to set client policy: {resp.status_code} {resp.text}"
    print("Registered client's policy.")

    # ---- Case processing ----
    while True:

        incident = input("Enter incident: ")

        # Client registers case
        resp = client_client.post("/app/cases", data=incident)
        assert resp.status_code == 200, (resp.status_code, resp.text)
        caseId = int(resp.text)
        print("Registered client's case.")

        while True:
            print("Requesting decision...")
            resp = client_client.get(f"/app/cases/indexed/{caseId}")
            assert resp.status_code == 200, (resp.status_code, resp.text)

            decision = resp.json()["metadata"]["decision"]["decision"]
            if decision != "":
                print(f"======= RECEIVED DECISION : {decision} =======")
                break

            time.sleep(2)