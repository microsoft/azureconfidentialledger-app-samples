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

class ProcessorDaemon:
  def __init__(self, uds_sock, acl_url, phi_repeats, model_path=None):
    self.phi = Phi(model_path=model_path) if model_path else Phi()
    self.uds_sock = f"unix://{uds_sock}"
    self.acl_url = "http://" + acl_url

    keypath, certpath = crypto.generate_or_read_cert()
    self.cert = (certpath, keypath)

    self.phi_repeats = phi_repeats

  def attest_data(self, report_data: bytes) -> bytes:
    print(f"Getting attestation from: {self.uds_sock}")
    stub=as_grpc.AttestationContainerStub(grpc.insecure_channel(self.uds_sock))
    report = stub.FetchAttestation(as_pb.FetchAttestationRequest(report_data=report_data))
    return report

  def register_with_acl(self):
    res = requests.get(self.acl_url + "/app/ccf-cert", cert=self.cert, verify=False)
    assert(res.status_code == 200)
    client_fingerprint = res.text
    attest_report = self.attest_data(hashlib.sha256(client_fingerprint.encode('utf-8')).digest())

    payload = {
      'attestation': base64.b64encode(attest_report.attestation).decode('ascii'),
      'platform_certificates': base64.b64encode(attest_report.platform_certificates).decode('ascii'),
      'uvm_endorsements': base64.b64encode(attest_report.uvm_endorsements).decode('ascii')
    }
    register_url = self.acl_url + "/app/register/processor"
    print(f"Registering with ACL at: {register_url}")
    response = requests.put(register_url, cert=self.cert, json=payload, verify=False)
    print(response)
    return response.status_code == 200

  def get_acl_incident_and_policy(self):
    res = requests.get(self.acl_url + "/app/next-incident", cert=self.cert, verify=False)
    if res.status_code == 404:
      return None
    if res.status_code not in {200}:
      raise ValueError("Error while getting next incident" + res.text())
    
    body = res.json()
    if "incident" not in body:
      raise ValueError(f"Body does not contain incident: {body}")
    if "policy" not in body:
      raise ValueError(f"Body does not contain policy: {body}")
    if "caseId" not in body:
      raise ValueError(f"Body does not contain caseId: {body}")
    try:
      int(body['caseId'])
    except:
      raise ValueError(f"Body.caseId is not an integer: {body['caseId']}")

    return {"incident": body['incident'], "policy": body['policy'], "caseId": int(body["caseId"])}

  def process_incident(self, incident: str, policy: str, caseId: int):
    decision = self.phi.process_incident(incident, policy, repeats=self.phi_repeats)
    # Register decision with ACL app, repeat until successful
    request_url = self.acl_url + f"/app/incident/{caseId}/decision"
    request_body = {
        'incident': incident,
        'policy': policy,
        'decision': str(decision)
      }
    print(f"Registering decision with ACL at: {request_url}")
    response = requests.put(request_url, json= request_body, verify=False)
    print(response)
    if response.status_code != 200:
      print(f"Failed to register decision for {caseId}")

  def start_processing(self):
    self.register_with_acl()
    while True:
      try:
        job = self.get_acl_incident_and_policy()
      except Exception as e:
        print("Exception while getting job.")
        print(e)
        job = None
      if job is None:
        time.sleep(10)
        continue
      print(f"Processing {job}")
      self.process_incident(job['incident'], job['policy'], job['caseId'])

if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--uds-sock", type=str, required=True, help="Path to unix domain socket for attestation side-car")
  parser.add_argument("--acl-url", type=str, required=True, help="URL for accessing Azure Confidential Ledger. ")
  parser.add_argument("--repeats", type=int, default=10, help="How many times Phi should try to process an incident.")
  args = parser.parse_args()

  ProcessorDaemon(args.uds_sock, args.acl_url, phi_repeats=args.repeats).start_processing()