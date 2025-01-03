
import grpc
import attestation_service_pb2_grpc as as_grpc
import attestation_service_pb2 as as_pb
import base64

import hashlib

from http.server import SimpleHTTPRequestHandler, HTTPServer
import ssl
import cgi
import json
import requests
import time

import argparse
import tempfile
import crypto

def attest_data(uds_sock, report_data: bytes) -> bytes:
  stub=as_grpc.AttestationContainerStub(grpc.insecure_channel(f"unix:{uds_sock}"))
  report = stub.FetchAttestation(report_data)
  return report

def register_with_acl(url, keypath, certpath, attestation, platform_certs, uvm_endorsements):
  payload = {
    'attestation': base64.b64encode(attestation),
    'platform_certificates': base64.b64encode(platform_certs),
    'uvm_endorsements': base64.b64encode(uvm_endorsements)
  }
  return requests.put(url, cert=(certpath, keypath), json=payload).status_code == 200

def process_incident(incident, policy):
  # TODO process claim
  return 100

class Handler(SimpleHTTPRequestHandler):
  acl_register_decision_url = None

  def do_POST(self):
    content_length = int(self.headers['Content-Length'])
    content_type, pdict = cgi.parse_header(self.headers['Content-Type'])
    
    if content_type != 'application/json':
      return self.send_error(400, message="Invalid content")

    # Read and validate body
    body = self.rfile.read(content_length)
    request_data = json.loads(body)
    if not 'incident' in request_data.keys: return self.send_error(400, 'No incident')
    if not 'policy' in request_data.keys: return self.send_error(400, 'No policy')
    if not 'caseId' in request_data.keys: return self.send_error(400, 'No caseId')

    result = process_incident(request_data['incident'], request_data['policy'])

    # Register decision with ACL app, repeat until successful
    request_url = self.acl_register_decision_url % request_data['caseId']
    request_body = {
        'incidentFingerprint':hashlib.sha256(request_data['incident']),
        'policy': request_data['policy'],
        'decision': str(result)
      }
    while(requests.put(request_url, json= request_body).status_code != 200):
      time.sleep(1000) # TODO non-blocking

    self.send_response(200)

if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--uds-sock", type=str)
  parser.add_argument("--listen", default="0.0.0.0:443")
  parser.add_argument("--acl-register-processor-url", type=str)
  parser.add_argument("--acl-register-decision-url")
  args = parser.parse_args()

  with tempfile.NamedTemporaryFile("w", suffix=".pem") as keyfile, \
       tempfile.NamedTemporaryFile("w", suffix=".pem") as certfile:

    # TODO ensure this is correct
    privk_pem_str, _ = crypto.generate_rsa_keypair(2048)
    cert_pem_str = crypto.generate_cert(privk_pem_str)

    keyfile.write(privk_pem_str)
    keyfile.flush()
    certfile.write(cert_pem_str)
    certfile.flush()

    attest_report = attest_data(args.uds_sock, hashlib.sha512(cert_pem_str.encode('ascii')).digest())

    register_with_acl(
      args.acl_register_processor_url,
      keyfile,
      certfile,
      attest_report.attestation,
      attest_report.platform_certificates,
      attest_report.uvm_endorsement)

    Handler.acl_register_decision_url = args.acl_register_decision_url

    [host,port] = args.listen
    httpd = HTTPServer((host, port), Handler)
    httpd.socket = ssl.wrap_socket(httpd.socket, certfile=certfile, keyfile=keyfile, server_side=True)
