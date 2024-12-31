
import grpc
import attestation_protobuf.attestation_service_pb2_grpc as as_grpc
import attestation_protobuf.attestation_service_pb2 as as_pb

from http.server import SimpleHTTPRequestHandler, HTTPServer
import ssl
import cgi
import json
import requests
import time

import argparse

def attest_data(uds_sock, report_data):
  stub=as_grpc.AttestationContainerStub(grpc.insecure_channel(f"unix:{uds_sock}"))
  report = stub.FetchAttestation(report_data=report_data.encode('utf-8'))
  return report

def process_incident(incident, policy):
  # TODO process claim
  return 100

def fingerprint(data):
  # Calculate fingerprint of data
  pass

class Handler(SimpleHTTPRequestHandler):
  acl_register_url = None

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

    result = process_incident(request_data['incident'], request_data['policy'])a

    # Register decision with ACL app, repeat until successful
    request_url = self.acl_register_url % request_data['caseId']
    request_body = {
        'incidentFingerprint':fingerprint(request_data['incident']),
        'policy': request_data['policy'],
        'decision': str(result)
      }
    while(requests.put(request_url, json= request_body).status_code != 200):
      time.sleep(1000) # TODO non-blocking

    self.send_response(200)

if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--uds-sock", type=str)
  parser.add_argument("--openssl-cert", type=str)
  parser.add_argument("--openssl-key", type=str)
  parser.add_argument("--listen", default="0.0.0.0:443")
  parser.add_argument("--acl-register-url", type=str)
  args = parser.parse_args()

  attest_ssl_key = attest_data(args.uds_sock, "FAKE_SSL_PUBKEY") # TODO fix

  Handler.acl_register_url = args.acl_register_url

  [host,port] = args.listen
  httpd = HTTPServer((host, port), Handler)
  httpd.socket = ssl.wrap_socket(httpd.socket, certfile=args.openssl_cert, keyfile=args.openssl_key, server_side=True)