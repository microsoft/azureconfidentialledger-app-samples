
import grpc
import attestation_protobuf.attestation_service_pb2_grpc as as_grpc
import attestation_protobuf.attestation_service_pb2 as as_pb
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

def attest_data(uds_sock, report_data):
  stub=as_grpc.AttestationContainerStub(grpc.insecure_channel(f"unix:{uds_sock}"))
  report = stub.FetchAttestation(report_data=report_data.encode('utf-8'))
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

    # TODO generate new key somehow
    key = "FakeKey"
    cert = "FakeCert"

    keyfile.write(key)
    keyfile.flush()
    certfile.write(cert)
    certfile.flush()

    attest_report = attest_data(args.uds_sock, hashlib.sha512(cert))

    register_with_acl(
      args.acl_register_processor_url,
      attest_report.attestation,
      attest_report.platform_certificates,
      attest_report.uvm_endorsement)

    Handler.acl_register_decision_url = args.acl_register_decision_url

    [host,port] = args.listen
    httpd = HTTPServer((host, port), Handler)
    httpd.socket = ssl.wrap_socket(httpd.socket, certfile=args.openssl_cert, keyfile=args.openssl_key, server_side=True)