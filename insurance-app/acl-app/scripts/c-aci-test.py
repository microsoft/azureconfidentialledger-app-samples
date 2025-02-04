import argparse
import json
import requests

import time

import ccf.cose
import crypto

# disables the "verify=False" warnings, as the request to pin the ca raise the warning
import urllib3

urllib3.disable_warnings()


def sign_bundle(identity, msg_type, bundle):
    (certpath, keypath) = identity
    serialised_bundle = json.dumps(bundle).encode()
    with open(keypath, "r") as key_file:
        key = key_file.read()
    if not key:
        raise ValueError("Key file is empty or improperly formatted.")
    with open(certpath, "r") as cert_file:
        cert = cert_file.read()
    if not cert:
        raise ValueError("Cert file is empty or improperly formatted.")
    phdr = {
        "acl.msg.type": msg_type,
        "acl.msg.created_at": int(time.time()),
    }
    return ccf.cose.create_cose_sign1(serialised_bundle, key, cert, phdr)


class RequestsClient:
    def __init__(self, acl_url, session_auth):
        self.acl_url = acl_url
        self.session_auth = session_auth

    def get(self, path, *args, **kwargs) -> requests.Response:
        return requests.get(
            self.acl_url + path, *args, cert=self.session_auth, verify=False, **kwargs
        )

    def put(self, path, *args, **kwargs) -> requests.Response:
        return requests.put(
            self.acl_url + path, *args, cert=self.session_auth, verify=False, **kwargs
        )

    def post(self, path, *args, **kwargs) -> requests.Response:
        return requests.post(
            self.acl_url + path, *args, cert=self.session_auth, verify=False, **kwargs
        )


USER_POLICY = "This policy covers all claims."
USER_INCIDENT = "The policyholder hit another car."

parser = argparse.ArgumentParser()
parser.add_argument("--admin-cert", type=str, help="Path to ACL admin certificate.")
parser.add_argument("--admin-key", type=str, help="Path to ACL admin private key.")
parser.add_argument(
    "--valid-processor-measurement",
    type=str,
    help="Base64 encoded processor measurement.",
)
parser.add_argument(
    "--valid-processor-policy", type=str, help="Base64 encoded processor policy."
)
parser.add_argument("--acl-url", type=str, default="https://localhost:8000")
parser.add_argument("--api-version", type=str, default="2024-08-22-preview")

if __name__ == "__main__":
    args = parser.parse_args()

    admin_identity = (args.admin_cert, args.admin_key)
    admin_client = RequestsClient(args.acl_url, admin_identity)

    client_keypath, client_certpath = crypto.generate_or_read_cert()
    client_identity = client_certpath, client_keypath
    client_client = RequestsClient(args.acl_url, client_identity)

    res = client_client.get("/app/ccf-cert")
    assert res.status_code == 200
    client_fingerprint = res.text

    # Register valid policy
    res = admin_client.put(
        "/app/processor/policy",
        json={
            "uvm_endorsements": {
                "did": "did:x509:0:sha256:I__iuL25oXEVFdTP_aBLx_eT1RPHbCQ_ECBQfYZpt9s::eku:1.3.6.1.4.1.311.76.59.1.2",
                "feed": "ContainerPlat-AMD-UVM",
                "svn": "101",
            },
            "measurement": [args.valid_processor_measurement],
            "policy": [args.valid_processor_policy],
        },
        headers={"content-type": "application/json"},
    )
    print(res.status_code, res.text)
    assert res.status_code == 200, f"Failed to set processor policy: {res.status_code} {res.text} | {res.request.body}"

    # ---- Client registration ----
    policy = input("Enter client policy: ")
    res = admin_client.put(
        "/app/user",
        json={
            "cert": client_fingerprint,
            "policy": policy,
        },
        headers={"content-type": "application/json"},
    )
    assert res.status_code == 200, f"Failed to set client policy: {res.status_code} {res.text}"

    # ---- Case processing ----
    while True:

        incident = input("Enter incident: ")

        # Client registers case
        res = client_client.post("/app/cases", data=incident)
        assert res.status_code == 200
        caseId = int(res.text)

        while True:
            print("Requesting decision")
            res = client_client.get(
                f"/app/cases/indexed/{caseId}",
            )

            decision = res.json()["metadata"]["decision"]["decision"]
            if decision != "":
                print(f"======= DECISION : {decision} =======")
                break

            time.sleep(2)