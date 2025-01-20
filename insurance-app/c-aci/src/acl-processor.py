import grpc
import attestation_service_pb2_grpc as as_grpc
import attestation_service_pb2 as as_pb
import base64

import hashlib

import requests

import argparse
import crypto

import time

from phi import Phi

import tempfile
import os

# disables the "verify=False" warnings, as the request to pin the ca raise the warning 
import urllib3
urllib3.disable_warnings() 

class ProcessorDaemon:
  def __init__(self, uds_sock, acl_url, phi_repeats, model_path=None):
    if model_path:
      self.phi = Phi(model_path=model_path)
    else:
      localpath = os.path.dirname(os.path.abspath(__file__))
      self.phi = Phi(os.path.join(localpath, "Phi-3-mini-4k-instruct-q4.gguf"))
    self.uds_sock = f"unix://{uds_sock}"
    self.raw_acl_url = acl_url
    self.acl_url = "https://" + acl_url
    self.phi_repeats = phi_repeats

    keypath, certpath = crypto.generate_or_read_cert()
    self.cert = (certpath, keypath)

  def attest_data(self, report_data: bytes) -> bytes:
    print(f"Getting attestation from: {self.uds_sock}", flush=True)
    stub=as_grpc.AttestationContainerStub(grpc.insecure_channel(self.uds_sock))
    report = stub.FetchAttestation(as_pb.FetchAttestationRequest(report_data=report_data))
    return report

  def setup_acl(self):
    # There is no safety issue in this sample for a MIM attack so we pin the certificate
    # This can also be baked into the container image, or released via a SKR service.
    # TODO make all other calls also use this CA (currently broken due to auth checks)
    print("Pinning acl service certificate", flush=True)
    res = requests.get("https://" + self.raw_acl_url + "/node/network", verify=False)
    if(res.status_code != 200):
      print(res, res.text, flush=True)
      raise ValueError("Unable to set up connection to ACL. Perhaps the app has not been loaded?")
    service_cert = res.json()['service_certificate']
    with tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as cafile:
      cafile.write(service_cert)
      cafile.flush()
      self.acl_ca = cafile.name

    print("Getting ccf_format certificate fingerprint", flush=True)
    res = requests.get(self.acl_url + "/app/ccf-cert", cert=self.cert, verify=False)
    if(res.status_code != 200):
      print(res, res.text, flush=True)
      raise ValueError("Unable to set up connection to ACL. Perhaps the app has not been loaded?")

    self.fingerprint = res.text

    attest_report = self.attest_data(hashlib.sha256(self.fingerprint.encode('utf-8')).digest())

    payload = {
      'attestation': base64.b64encode(attest_report.attestation).decode('ascii'),
      'platform_certificates': base64.b64encode(attest_report.platform_certificates).decode('ascii'),
      'uvm_endorsements': base64.b64encode(attest_report.uvm_endorsements).decode('ascii')
    }
    register_url = self.acl_url + "/app/processor"
    print(f"Registering with ACL at: {register_url}", flush=True)
    response = requests.put(register_url, cert=self.cert, json=payload, verify=False)
    if response.status_code != 200:
      print("Failed to register with ACL. Exiting now", flush=True)
      print(response, response.text, flush=True)
      exit(-1)

    print("Successfully registered with ACL", flush=True)

  def get_acl_incident_and_policy(self):
    res = requests.get(self.acl_url + "/app/cases/next", cert=self.cert, verify=False)
    if res.status_code == 404:
      return None
    if res.status_code not in {200}:
      raise ValueError("Error while getting next incident" + res.text())
    
    body = res.json()
    if "caseId" not in body:
      raise ValueError(f"Body does not contain caseId: {body}")
    try:
      int(body['caseId'])
    except:
      raise ValueError(f"Body.caseId is not an integer: {body['caseId']}")
    if "metadata" not in body:
      raise ValueError(f"Body does not contain any metadata: {body}")
    metadata = body['metadata']
    if "incident" not in metadata:
      raise ValueError(f"Metadata does not contain incident: {metadata}")
    if "policy" not in metadata:
      raise ValueError(f"Metadata does not contain policy: {metadata}")

    return {"incident": metadata['incident'], "policy": metadata['policy'], "caseId": int(body["caseId"])}

  def process_incident(self, incident: str, policy: str, caseId: int):
    decision = self.phi.process_incident(incident, policy, repeats=self.phi_repeats)
    # Register decision with ACL app, repeat until successful
    request_url = self.acl_url + f"/app/cases/indexed/{caseId}/decision"
    request_body = {
        'incident': incident,
        'policy': policy,
        'decision': str(decision)
      }
    print(f"Registering decision with ACL at: {request_url}", flush=True)
    response = requests.post(request_url, cert=self.cert, json= request_body, verify=False)
    print(response, response.text, flush=True)
    if response.status_code != 200:
      print(f"Failed to register decision for {caseId}", flush=True)

  def start_processing(self):
    while True:
      try:
        job = self.get_acl_incident_and_policy()
      except Exception as e:
        print("Exception while getting job.", flush=True)
        print(e, flush=True)
        job = None
      if job is None:
        time.sleep(1)
        continue
      print(f"Processing {job}", flush=True)
      self.process_incident(job['incident'], job['policy'], job['caseId'])

if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--acl-url", type=str, required=True, help="URL for accessing Azure Confidential Ledger. ")
  parser.add_argument("--uds-sock", type=str, default="/mnt/uds/sock", help="Path to unix domain socket for attestation side-car")
  parser.add_argument("--repeats", type=int, default=10, help="How many times Phi should try to process an incident.")
  parser.add_argument("--prime-phi", action="store_true", help="Run a test prompt through phi to remove load time from execution.")
  args = parser.parse_args()

  processor = ProcessorDaemon(args.uds_sock, args.acl_url, phi_repeats=args.repeats)
  processor.setup_acl()
  if args.prime_phi:
    processor.phi.process_incident("The policyholder hit a car", "This policy approves all claims.")
  processor.start_processing()