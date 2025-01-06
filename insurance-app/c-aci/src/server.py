
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

import argparse
import crypto

from phi import process_incident

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
  register_url = url + "/app/processor/register"
  print(f"Registering with ACL at: {register_url}")
  response = requests.put(register_url, cert=(certpath, keypath), json=payload)
  return response.status_code == 200

class Handler(SimpleHTTPRequestHandler):
  acl_url = None

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
    request_url = self.acl_url + f"/app/incident/{request_data['caseId']}/decision"
    request_body = {
        'incidentFingerprint':hashlib.sha256(request_data['incident']),
        'policy': request_data['policy'],
        'decision': str(result)
      }
    print(f"Registering decision with ACL at: {request_url}")

    response = requests.put(request_url, json= request_body)
    if response.status_code != 200:
      print("Failed to register decision")
      self.send_error(400, message="Failed to register decision")
    else:
      self.send_response(200)

  
if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--uds-sock", type=str)
  parser.add_argument("--listen", default="0.0.0.0:443")
  parser.add_argument("--acl-url", type=str)
  parser.add_argument("--credentials-root", type = str, default=None)
  args = parser.parse_args()

  keypath, certpath = crypto.generate_or_read_cert(credential_root=args.credentials_root)

  res = requests.get(f"https://{args.acl_address}/app/user_cert", cert=(certpath, keypath) )
  assert(res.status_code == 200)
  client_fingerprint = res.body.text()
  #client_fingerprint = "82:8C:80:4E:E3:F1:F3:75:DE:81:13:08:CD:17:60:10:02:DA:F3:E8:E1:A8:31:6E:2A:57:2F:47:D8:97:82:8F"

  attest_report = attest_data(args.uds_sock, hashlib.sha256(client_fingerprint.encode('utf-8')).digest())

  register_with_acl(
    args.acl_url,
    keypath,
    certpath,
    attest_report.attestation,
    attest_report.platform_certificates,
    attest_report.uvm_endorsements)

  Handler.acl_url = args.acl_url

  [host,port] = args.listen.split(':')
  httpd = HTTPServer((host, port), Handler)
  httpd.socket = ssl.wrap_socket(httpd.socket, certfile=certpath, keyfile=keypath, server_side=True)
