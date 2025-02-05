import argparse
import json
import httpx

import time

import crypto


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


USER_POLICY = "This policy covers all claims."
USER_INCIDENT = "The policyholder hit another car."

parser = argparse.ArgumentParser()
parser.add_argument("--admin-cert", type=str, help="Path to ACL admin certificate.")
parser.add_argument("--admin-key", type=str, help="Path to ACL admin private key.")
parser.add_argument("--bundle", type=str, help="Path to app bundle.json")
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
    r = httpx.put(
        f"{args.acl_url}/app/userDefinedEndpoints?api-version={args.api_version}",
        data=signed_bundle,
        headers={"content-type": "application/cose"},
        verify=False,
    )
    assert r.status_code in {200, 201}, (r.status_code, r.text)
    print("Uploaded app as cose signed bundle.")

    res = client_client.get("/app/ccf-cert")
    assert res.status_code == 200
    client_fingerprint = res.text

    # ---- Register valid policy ----
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
    assert (
        res.status_code == 200
    ), f"Failed to set processor policy: {res.status_code} {res.text} | {res.request.body}"

    # ---- Client registration ----
    policy = input("Enter client policy: ")
    res = admin_client.put(
        "/app/user",
        json={"cert": client_fingerprint, "policy": policy},
        headers={"content-type": "application/json"},
    )
    assert (
        res.status_code == 200
    ), f"Failed to set client policy: {res.status_code} {res.text}"

    # ---- Case processing ----
    while True:

        incident = input("Enter incident: ")

        # Client registers case
        res = client_client.post("/app/cases", data=incident)
        assert res.status_code == 200
        caseId = int(res.text)

        while True:
            print("Requesting decision")
            res = client_client.get(f"/app/cases/indexed/{caseId}")

            decision = res.json()["metadata"]["decision"]["decision"]
            if decision != "":
                print(f"======= DECISION : {decision} =======")
                break

            time.sleep(2)
