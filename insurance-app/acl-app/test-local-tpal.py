import argparse
import json
import tempfile
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--setup', action='store_true', default=False, help="Set up ledger's builtin roles")
parser.add_argument('--add-roles', action='store_true', default=False, help="Add role")
parser.add_argument('--bundle', type=str, help="Bundle to deploy")
parser.add_argument('--tpal-tests-directory', type=str, help="Path to tpal tests to re-use that infrastructure.")
parser.add_argument('--sandbox-common', type=str, help="Path to sandbox_common for workspace")


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
            {"role_name": "InsuranceUser", "role_actions": ["/policy/read"]}
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

      print(write_client.get("/app/dump_table").body.text())


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

    # Set up temporary keys for processor
    processor_privk_pem_str, _ = tester.generate_rsa_keypair(2048)
    processor_cert_pem_str = tester.generate_cert(client_privk_pem_str)
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
      res = client.get("/app/user_cert")
      client_fingerprint = res.body.text()

      # Register policy
      admin_client.put(
        "/app/policy",
        body={
          "cert": client_fingerprint,
          "policy": "Test Policy",
        },
        headers={"content-type": "application/json"}
      )

      # Register processor attestation
      admin_client.put(
        "/app/processor/attestation",
        body="NotAnAttestation",
        headers={"content-type": "application/text"}
      )

      # Register processor
      processor_client.put(
        "/app/processor/register",
        body="NotAnAttestation",
        headers={"content-type": "application/text"}
      )

      # Register case report
      resp = client.post(
        "/app/incident",
        body={
          "incidentFingerprint": "testFingerprint",
        },
        headers={"content-type": "application/json"},
      )
      assert(resp.status_code == 200)
      case_report = resp.body.json()

      client.get(
        f"/app/incident/{case_report['caseId']}/metadata",
      )

      # Register case decision
      processor_client.put(
        f"/app/incident/{case_report['caseId']}/decision",
        body={
          "incidentFingerprint": "testFingerprint",
          "policy": case_report['policy'],
          "decision": 100,
        },
        headers={"content-type": "application/json"}
      )

      # Get case decision
      client.get(
        f"/app/incident/{case_report['caseId']}/decision",
      )