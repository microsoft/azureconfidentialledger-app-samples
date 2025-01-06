
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

import os

def attest_data(uds_sock, report_data: bytes) -> bytes:
  path = f"unix://{uds_sock}"
  print(f"Getting attestation from: {path}")
  stub=as_grpc.AttestationContainerStub(grpc.insecure_channel(path))
  report = stub.FetchAttestation(as_pb.FetchAttestationRequest(report_data=report_data))
  return report

def register_with_acl(url, keypath, certpath, attestation, platform_certs, uvm_endorsements):
  payload = {
    'attestation': base64.b64encode(attestation).decode('ascii'),
    'platform_certificates': base64.b64encode(platform_certs).decode('ascii'),
    'uvm_endorsements': base64.b64encode(uvm_endorsements).decode('ascii')
  }
  print(payload)
  print(f"Registering with ACL at: {url}")
  return True
  response = requests.put(url, cert=(certpath, keypath), json=payload)

  return response.status_code == 200

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
    print(f"Registering decision with ACL at: {request_url}")
    print(request_body)
    #while(requests.put(request_url, json= request_body).status_code != 200):
    #  time.sleep(1000) # TODO non-blocking

    self.send_response(200)

def generate_or_read_cert(credential_root):
  keypath = None
  certpath = None
  if credential_root is not None:
    keypath = f"{credential_root}.privk.pem"
    certpath = f"{credential_root}.certpath.pem"

  # Files exist so just use them
  if keypath and os.path.isfile(keypath) and \
       certpath and os.path.isfile(certpath):
    return keypath, certpath

  # Files don't exist so write to them
  if (keypath and not os.path.isfile(keypath)) or \
     (certpath and not os.path.isfile(certpath)):
    # TODO ensure this is correct
    privk_pem_str, _ = crypto.generate_rsa_keypair(2048)
    cert_pem_str = crypto.generate_cert(privk_pem_str)

    # TODO delete
    print(privk_pem_str)
    print(cert_pem_str)

    with open(keypath, "w") as keyfile, \
         open(certpath, "w") as certfile:
      keyfile.write(privk_pem_str)
      certfile.write(cert_pem_str)

    return keypath, certpath

  # Generate an ephemeral key
  if keypath == None:
    with tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as keyfile, \
        tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as certfile:

      # TODO ensure this is correct
      privk_pem_str, _ = crypto.generate_rsa_keypair(2048)
      cert_pem_str = crypto.generate_cert(privk_pem_str)

      # TODO delete
      print(privk_pem_str)
      print(cert_pem_str)

      keyfile.write(privk_pem_str)
      keyfile.flush()
      certfile.write(cert_pem_str)
      certfile.flush()

      keypath = keyfile.name
      certpath = certfile.name

      return keypath, certpath
  
if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--uds-sock", type=str)
  parser.add_argument("--listen", default="0.0.0.0:443")
  parser.add_argument("--acl-url", type=str)
  parser.add_argument("--credentials-root", type = str, default=None)
  args = parser.parse_args()

  keypath, certpath = generate_or_read_cert(args.credentials_root)

  #res = requests.get(f"https://{args.acl_address}/app/user_cert", cert=(certpath, keypath) )
  #client_fingerprint = res.body.text()
  client_fingerprint = ""

  attest_report = attest_data(args.uds_sock, hashlib.sha256(client_fingerprint).digest())

  register_with_acl(
    args.acl_register_processor_url,
    keypath,
    certpath,
    attest_report.attestation,
    attest_report.platform_certificates,
    attest_report.uvm_endorsements)

  Handler.acl_register_decision_url = args.acl_register_decision_url

  [host,port] = args.listen.split(':')
  httpd = HTTPServer((host, port), Handler)
  httpd.socket = ssl.wrap_socket(httpd.socket, certfile=certpath, keyfile=keypath, server_side=True)
