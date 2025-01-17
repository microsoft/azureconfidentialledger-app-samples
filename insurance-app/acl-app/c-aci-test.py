import argparse
import json
import tempfile
import sys
import requests

import time

USER_POLICY = "This policy covers all claims."
USER_INCIDENT = "The policyholder hit another car."

parser = argparse.ArgumentParser()
parser.add_argument('--setup', action='store_true', default=False, help="Set up ledger's builtin roles")
parser.add_argument('--add-roles', action='store_true', default=False, help="Add role")
parser.add_argument('--bundle', type=str, help="Bundle to deploy")
parser.add_argument('--tpal-tests-directory', type=str, help="Path to tpal tests to re-use that infrastructure.")
parser.add_argument('--sandbox-common', type=str, help="Path to sandbox_common for workspace")
parser.add_argument('--aci-container-url', type=str, help="URL of attested aci container")

if __name__ == "__main__":
  args=parser.parse_args()
  sys.path.append(args.tpal_tests_directory)
  import tester
  from programmability_test_helpers.programmability_test_setup import CCFEndPointUserTest;

  test_harness = CCFEndPointUserTest(args.sandbox_common, "2024-08-22-preview", [tester.CCFEndpoint("127.0.0.1", 8000, "0")])
  if args.setup :
    test_harness._setup_ledger()

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
    cose_installer.put(
      f"/app/userDefinedEndpoints?api-version={test_harness.api_version}",
      body=signed_bundle,
      headers={"content-type":"application/cose"}
    )
  
  # Assign roles
  if args.add_roles:
    with tester.client_set(
      endpoints=test_harness.endpoints,
      network_cert_file=test_harness.ca,
      session_auth=admin_cert_identity
    ) as write_client:
      write_client.put(
        f"/app/roles?api-version={test_harness.api_version}",
        body={
          "roles": [
            {"role_name": "InsuranceAdmin", "role_actions": ["/policy/write", "/processor/write"]},
          ]
        },
        headers={"content-type":"application/json"}
      )

      admin_fingerprint = test_harness._format_cert_fingerprint(test_harness.admin_cert_fingerprint)

      write_client.patch(
        f"/app/ledgerUsers/{admin_fingerprint}?api-version={test_harness.api_version}",
        body={"assignedRoles": ['insuranceadmin']},
        headers={"content-type": "application/merge-patch+json"},
      )

  with tempfile.NamedTemporaryFile("w", suffix=".pem") as client_privk_file, \
       tempfile.NamedTemporaryFile("w", suffix=".pem") as client_cert_file, \
       tempfile.NamedTemporaryFile("w", suffix=".pem") as processor_privk_file, \
       tempfile.NamedTemporaryFile("w", suffix=".pem") as processor_cert_file:

    # Set up client temporary keys
    client_privk_pem_str, _ = tester.generate_rsa_keypair(2048)
    client_cert_pem_str = tester.generate_cert(client_privk_pem_str)
    client_privk_file.write(client_privk_pem_str)
    client_privk_file.flush()
    client_cert_file.write(client_cert_pem_str)
    client_cert_file.flush()
    client_identity = test_harness._get_cert_identity(client_cert_file.name, client_privk_file.name)

    ## Set up temporary keys for processor
    processor_privk_file.write(client_privk_pem_str)
    processor_privk_file.flush()
    processor_cert_file.write(client_cert_pem_str)
    processor_cert_file.flush()
    processor_identity = test_harness._get_cert_identity(client_cert_file.name, client_privk_file.name)

    with tester.client_set(
        endpoints=test_harness.endpoints,
        network_cert_file=test_harness.ca,
        session_auth=client_identity
      ) as client, \
      tester.client_set(
        endpoints=test_harness.endpoints,
        network_cert_file=test_harness.ca,
        session_auth=processor_identity,
      ) as processor_client, \
      tester.client_set(
        endpoints=test_harness.endpoints,
        network_cert_file=test_harness.ca,
        session_auth=admin_cert_identity,
      ) as admin_client:

      res = client.get("/app/ccf-cert")
      client_fingerprint = res.body.text()
      res = processor_client.get("/app/ccf-cert")
      processor_fingerprint = res.body.text()
      print({"processor": processor_fingerprint, "client": client_fingerprint})

      # ---- Processor registration ----
      # Register valid policy
      admin_client.put(
        "/app/processor/policy",
        body=
        #{"uvm_endorsements":{
        #  "did":"did:x509:0:sha256:I__iuL25oXEVFdTP_aBLx_eT1RPHbCQ_ECBQfYZpt9s::eku:1.3.6.1.4.1.311.76.59.1.2",
        #  "feed":"ContainerPlat-AMD-UVM",
        #  "svn":"101"
        #  },
        #  "measurement":["GCWkvyqcODVmpxdjJoOawONqHFs36eb6vI/dcTDVjO9W9DR1ArlHiVMM7BmKpRVD"],
        #  "policy":["T0RIxn88jfyN6KXjcSXYB9rcxB8GzyP2FdvVLux3fRA="]}
        {"uvm_endorsements":{
          "did":"did:x509:0:sha256:iuL25oXEVFdTP_aBLx_eT1RPHbCQ_ECBQfYt9s::eku:1.3.6.1.4.1.311.76.59.1.2",
          "feed":"ContainerPlat-AMD-UVM",
          "svn":"101"
          },
          "measurement":["GCWkvyqcODVmpxdjJoOawONqHFs36eb6vI/dcTDVjO9W9DR1ArlHiVMM7BmKpRVD"],
          "policy":["T0RIxn88jfyN6KXjcSXYB9rcxB8GzyP2FdvVLux3fRA="]}
        ,
        headers={"content-type": "application/json"}
      )
      resp = admin_client.get("/app/processor/policy")
      print(resp.body)

      # ---- Client registration ----
      admin_client.put(
        "/app/user",
        body={
          "cert": client_fingerprint,
          "policy": USER_POLICY,
        },
        headers={"content-type": "application/json"}
      )

      # ---- Case processing ----

      # Client registers case
      resp = client.post(
        "/app/cases",
        body=USER_INCIDENT
      )
      print(resp)
      assert(resp.status_code == 200)
      caseId = int(resp.body.text())

      while True:
        resp = client.get(
          f"/app/cases/indexed/{caseId}",
        )

        decision = resp.body.json()['decision']
        if decision != "":
          print(f"======= DECISION : {decision} =======")
          break

        time.sleep(1)