#!/usr/bin/env python3
"""
COSE_Sign1 Signing Tool for Azure Confidential Ledger Code Transparency

Produces COSE_Sign1 envelopes that can be submitted to the ledger.
Supports key generation, signing, and inspection of envelopes.

Usage:
  # Generate a test key pair
  python sign_tool.py keygen --out testkey

  # Sign a payload
  python sign_tool.py sign --key testkey.pem --payload "hello world" --issuer "did:web:contoso.com" --content-type "application/spdx+json"

  # Sign from a file
  python sign_tool.py sign --key testkey.pem --payload-file sbom.json --issuer "did:web:contoso.com" --content-type "application/spdx+json"

  # Inspect a COSE_Sign1 envelope (show headers + payload)
  python sign_tool.py inspect --envelope signed.cose

  # Submit to the ledger (wraps as JSON for current prototype endpoint)
  python sign_tool.py submit --envelope signed.cose --ledger-url https://<your-ledger>.confidential-ledger.azure.com --scope contoso/firmware
"""

import argparse
import json
import sys
import time
import base64
import subprocess
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ec, ed25519
from cryptography.hazmat.primitives import serialization
from pycose.messages import Sign1Message
from pycose.headers import Algorithm, ContentType, KID
from pycose.algorithms import Es256, Es384, EdDSA
from pycose.keys import EC2Key, OKPKey
from pycose.keys.curves import P256, P384, Ed25519
import cbor2


# -- SCITT-compatible header labels --
HEADER_ISSUER = 391       # SCITTIssuer (draft-ietf-scitt-architecture)
HEADER_FEED = 392         # SCITTFeed
HEADER_CWT_CLAIMS = 15    # CWT Claims
CWT_ISS = 1              # CWT issuer claim
CWT_SUB = 2              # CWT subject/feed claim
CWT_IAT = 6              # CWT issued-at claim


def resolve_ledger_url(args):
    """Resolve ledger URL from --ledger-url arg or LEDGER_URL env var."""
    import os
    url = args.ledger_url or os.environ.get("LEDGER_URL")
    if not url:
        ledger_name = os.environ.get("LEDGER_NAME")
        if ledger_name:
            url = f"https://{ledger_name}.confidential-ledger.azure.com"
    if not url:
        print("ERROR: No ledger URL specified.")
        print("Use --ledger-url, or set LEDGER_URL or LEDGER_NAME environment variable.")
        sys.exit(1)
    args.ledger_url = url


def cmd_keygen(args):
    """Generate an EC P-256 key pair for testing."""
    private_key = ec.generate_private_key(ec.SECP256R1())

    # Save private key (PEM)
    priv_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    priv_path = Path(f"{args.out}.pem")
    priv_path.write_bytes(priv_pem)

    # Save public key (PEM)
    pub_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    pub_path = Path(f"{args.out}.pub.pem")
    pub_path.write_bytes(pub_pem)

    print(f"Private key: {priv_path}")
    print(f"Public key:  {pub_path}")
    print(f"Algorithm:   ES256 (P-256 / ECDSA-SHA256)")


def load_private_key(key_path: str):
    """Load a PEM private key and return (cryptography key, cose key, algorithm name)."""
    pem_data = Path(key_path).read_bytes()
    priv_key = serialization.load_pem_private_key(pem_data, password=None)

    if isinstance(priv_key, ec.EllipticCurvePrivateKey):
        numbers = priv_key.private_numbers()
        curve = priv_key.curve

        if isinstance(curve, ec.SECP256R1):
            cose_key = EC2Key(
                crv=P256,
                d=numbers.private_value.to_bytes(32, "big"),
                x=numbers.public_numbers.x.to_bytes(32, "big"),
                y=numbers.public_numbers.y.to_bytes(32, "big"),
            )
            return priv_key, cose_key, Es256, "ES256"
        elif isinstance(curve, ec.SECP384R1):
            cose_key = EC2Key(
                crv=P384,
                d=numbers.private_value.to_bytes(48, "big"),
                x=numbers.public_numbers.x.to_bytes(48, "big"),
                y=numbers.public_numbers.y.to_bytes(48, "big"),
            )
            return priv_key, cose_key, Es384, "ES384"
        else:
            raise ValueError(f"Unsupported EC curve: {curve.name}")

    elif isinstance(priv_key, ed25519.Ed25519PrivateKey):
        raw_priv = priv_key.private_bytes(
            serialization.Encoding.Raw,
            serialization.PrivateFormat.Raw,
            serialization.NoEncryption(),
        )
        raw_pub = priv_key.public_key().public_bytes(
            serialization.Encoding.Raw,
            serialization.PublicFormat.Raw,
        )
        cose_key = OKPKey(
            crv=Ed25519,
            d=raw_priv,
            x=raw_pub,
        )
        return priv_key, cose_key, EdDSA, "EdDSA"

    else:
        raise ValueError(f"Unsupported key type: {type(priv_key).__name__}")


def cmd_sign(args):
    """Sign a payload and produce a COSE_Sign1 envelope."""
    # Load key
    _, cose_key, algorithm, alg_name = load_private_key(args.key)

    # Load payload
    if args.payload_file:
        payload = Path(args.payload_file).read_bytes()
    elif args.payload:
        payload = args.payload.encode("utf-8")
    else:
        print("Error: provide --payload or --payload-file", file=sys.stderr)
        sys.exit(1)

    # Build protected headers
    phdr = {
        Algorithm: algorithm,
    }
    if args.content_type:
        phdr[ContentType] = args.content_type
    if args.kid:
        phdr[KID] = args.kid.encode("utf-8")

    # Add SCITT-style issuer/feed via CWT claims (label 15)
    cwt_claims = {}
    if args.issuer:
        cwt_claims[CWT_ISS] = args.issuer
    if args.feed:
        cwt_claims[CWT_SUB] = args.feed
    cwt_claims[CWT_IAT] = int(time.time())
    if args.svn is not None:
        cwt_claims["svn"] = args.svn

    if cwt_claims:
        phdr[HEADER_CWT_CLAIMS] = cbor2.dumps(cwt_claims)

    # Also set direct SCITT headers for simpler parsing
    if args.issuer:
        phdr[HEADER_ISSUER] = args.issuer
    if args.feed:
        phdr[HEADER_FEED] = args.feed

    # Create and sign
    msg = Sign1Message(phdr=phdr, payload=payload)
    msg.key = cose_key
    envelope = msg.encode(tag=True)

    # Write output
    out_path = Path(args.out)
    out_path.write_bytes(envelope)

    print(f"Signed envelope: {out_path} ({len(envelope)} bytes)")
    print(f"  Algorithm:    {alg_name}")
    print(f"  Issuer:       {args.issuer or '(none)'}")
    print(f"  Content-Type: {args.content_type or '(none)'}")
    print(f"  Feed:         {args.feed or '(none)'}")
    print(f"  Issued-At:    {cwt_claims.get(CWT_IAT, 'N/A')}")
    print(f"  Payload size: {len(payload)} bytes")


def cmd_inspect(args):
    """Inspect a COSE_Sign1 envelope: decode and display headers + payload."""
    data = Path(args.envelope).read_bytes()
    msg = Sign1Message.decode(data)

    print("=== COSE_Sign1 Envelope ===")
    print(f"File: {args.envelope} ({len(data)} bytes)")
    print()

    # Protected headers
    print("Protected Headers:")
    phdr = msg.phdr
    for label, value in phdr.items():
        label_name = _label_name(label)
        if label == HEADER_CWT_CLAIMS and isinstance(value, bytes):
            cwt = cbor2.loads(value)
            print(f"  {label_name}: (CWT Claims)")
            for ck, cv in cwt.items():
                print(f"    {_cwt_label(ck)}: {cv}")
        elif isinstance(value, bytes):
            try:
                print(f"  {label_name}: {value.decode('utf-8')}")
            except UnicodeDecodeError:
                print(f"  {label_name}: {value.hex()}")
        else:
            print(f"  {label_name}: {value}")

    # Unprotected headers
    if msg.uhdr:
        print()
        print("Unprotected Headers:")
        for label, value in msg.uhdr.items():
            print(f"  {_label_name(label)}: {value}")

    # Payload
    print()
    print("Payload:")
    if msg.payload:
        try:
            text = msg.payload.decode("utf-8")
            # Try to pretty-print JSON
            try:
                parsed = json.loads(text)
                print(f"  {json.dumps(parsed, indent=2)}")
            except json.JSONDecodeError:
                print(f"  {text}")
        except UnicodeDecodeError:
            print(f"  ({len(msg.payload)} bytes, binary)")
    else:
        print("  (empty/detached)")


def _label_name(label):
    """Map COSE header labels to human-readable names."""
    names = {
        1: "Algorithm",
        3: "Content-Type",
        4: "KID",
        33: "X5chain",
        HEADER_CWT_CLAIMS: "CWT-Claims",
        HEADER_ISSUER: "SCITT-Issuer",
        HEADER_FEED: "SCITT-Feed",
    }
    # pycose uses class objects as keys; try the label value attribute
    key = getattr(label, "identifier", label)
    return names.get(key, str(label))


def _cwt_label(label):
    names = {CWT_ISS: "iss", CWT_SUB: "sub", CWT_IAT: "iat"}
    return names.get(label, str(label))


def cmd_submit(args):
    """Submit a COSE_Sign1 envelope to the ledger.

    For the current prototype, this extracts headers from the COSE envelope
    and sends them as JSON to the existing endpoint. In production, this would
    send the raw COSE binary.
    """
    resolve_ledger_url(args)
    data = Path(args.envelope).read_bytes()
    msg = Sign1Message.decode(data)

    # Extract headers for JSON submission
    phdr = msg.phdr
    headers = {}

    # Algorithm
    alg = phdr.get(Algorithm)
    if alg:
        alg_map = {Es256: "ES256", Es384: "ES384", EdDSA: "EdDSA"}
        headers["alg"] = alg_map.get(alg, str(alg))

    # Content-Type
    ct = phdr.get(ContentType)
    if ct:
        headers["contentType"] = ct if isinstance(ct, str) else ct.decode("utf-8") if isinstance(ct, bytes) else str(ct)

    # Issuer (try direct header first, then CWT)
    issuer = phdr.get(HEADER_ISSUER)
    if issuer:
        headers["issuer"] = issuer if isinstance(issuer, str) else issuer.decode("utf-8")

    # Issued-at from CWT
    cwt_raw = phdr.get(HEADER_CWT_CLAIMS)
    if cwt_raw and isinstance(cwt_raw, bytes):
        cwt = cbor2.loads(cwt_raw)
        if CWT_IAT in cwt:
            headers["issuedAt"] = cwt[CWT_IAT]
        if CWT_ISS in cwt and "issuer" not in headers:
            headers["issuer"] = cwt[CWT_ISS]
        if "svn" in cwt:
            headers["svn"] = cwt["svn"]
        if CWT_SUB in cwt:
            headers["feed"] = cwt[CWT_SUB]

    # Feed (try direct header, then CWT above)
    feed_direct = phdr.get(HEADER_FEED)
    if feed_direct and "feed" not in headers:
        headers["feed"] = feed_direct if isinstance(feed_direct, str) else feed_direct.decode("utf-8")

    # Payload as string
    payload_str = ""
    if msg.payload:
        try:
            payload_str = msg.payload.decode("utf-8")
        except UnicodeDecodeError:
            payload_str = base64.b64encode(msg.payload).decode("ascii")

    body = {"headers": headers, "payload": payload_str}

    # Get auth token
    if args.token:
        token = args.token
    else:
        print("[*] Fetching token via 'az account get-access-token'...")
        az_cmd = "az.cmd" if sys.platform == "win32" else "az"
        result = subprocess.run(
            [az_cmd, "account", "get-access-token", "--resource", "https://confidential-ledger.azure.com"],
            capture_output=True, text=True, shell=(sys.platform == "win32"),
        )
        if result.returncode != 0:
            print(f"Error getting token: {result.stderr}", file=sys.stderr)
            sys.exit(1)
        token = json.loads(result.stdout)["accessToken"]

    # Submit
    url = f"{args.ledger_url}/app/scopes/{args.scope}/entries"
    print(f"[*] Submitting to {url}")
    print(f"    Headers: {json.dumps(headers)}")
    print(f"    Payload: {payload_str[:80]}{'...' if len(payload_str) > 80 else ''}")

    import urllib.request
    import ssl

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            resp_body = json.loads(resp.read().decode("utf-8"))
            scope_key = resp_body.get('scopeKey', args.scope)
            seqno = resp_body.get('seqno', 'N/A')

            print()
            print(f"=== Submitted (HTTP {resp.status}) ===")
            print(f"  Entry ID:     {resp_body.get('entryId', 'N/A')}")
            print(f"  Scope:        {scope_key}")
            print(f"  Sequence:     {seqno}")
            print(f"  Submitter:    {resp_body.get('submitterId', 'N/A')}")
            print(f"  Payload Hash: {resp_body.get('payloadHash', 'N/A')}")
            print(f"  Policy Hash:  {resp_body.get('policyHash', 'N/A')}")
            policy = resp_body.get("policyResult", {})
            if policy.get("passed"):
                print(f"  Policy:       PASSED")
            else:
                print(f"  Policy:       FAILED - {policy.get('errors', [])}")

            # Entry submitted successfully
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"\n=== Submission Failed (HTTP {e.code}) ===")
        print(f"  {body}")
        sys.exit(1)


def cmd_policy(args):
    """View the policy configured for a scope."""
    resolve_ledger_url(args)
    import urllib.request
    import ssl

    url = f"{args.ledger_url}/app/scopes/{args.scope}/policy"

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(url, method="GET")

    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            policy = data.get("policy", {})
            scope_key = data.get("scopeKey", args.scope)

            print(f"=== Policy for {scope_key} ===")
            print()

            if not policy:
                print("  (no policy - all submissions accepted)")
                return

            if "issuerAllowlist" in policy:
                print("  Issuer Allowlist:")
                for issuer in policy["issuerAllowlist"]:
                    print(f"    - {issuer}")

            if "allowedAlgorithms" in policy:
                print("  Allowed Algorithms:")
                for alg in policy["allowedAlgorithms"]:
                    print(f"    - {alg}")

            if "contentTypeFilter" in policy:
                print("  Content Type Filter:")
                for ct in policy["contentTypeFilter"]:
                    print(f"    - {ct}")

            if "signatureFreshness" in policy:
                secs = policy["signatureFreshness"]
                if secs >= 86400:
                    human = f"{secs // 86400}d"
                elif secs >= 3600:
                    human = f"{secs // 3600}h"
                else:
                    human = f"{secs}s"
                print(f"  Signature Freshness: {secs}s ({human})")

            if "minimumSVN" in policy:
                print(f"  Minimum SVN: {policy['minimumSVN']}")

            if policy.get("requireAttestation"):
                print("  TEE Attestation: required")

            print()
            print("Raw JSON:")
            print(f"  {json.dumps(policy, indent=2)}")

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"Error (HTTP {e.code}): {body}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="COSE_Sign1 Signing Tool for Azure Confidential Ledger Code Transparency",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # keygen
    kg = sub.add_parser("keygen", help="Generate an EC P-256 test key pair")
    kg.add_argument("--out", default="testkey", help="Output file prefix (default: testkey)")

    # sign
    sg = sub.add_parser("sign", help="Sign a payload into a COSE_Sign1 envelope")
    sg.add_argument("--key", required=True, help="Path to PEM private key")
    sg.add_argument("--payload", help="Payload string to sign")
    sg.add_argument("--payload-file", help="Path to payload file")
    sg.add_argument("--issuer", help="Issuer DID (e.g., did:web:contoso.com)")
    sg.add_argument("--content-type", default="application/json", help="Content type (default: application/json)")
    sg.add_argument("--feed", help="Optional feed/scope identifier")
    sg.add_argument("--kid", help="Optional key identifier")
    sg.add_argument("--svn", type=int, help="Optional security version number")
    sg.add_argument("--out", default="signed.cose", help="Output file (default: signed.cose)")

    # inspect
    ins = sub.add_parser("inspect", help="Inspect a COSE_Sign1 envelope")
    ins.add_argument("--envelope", required=True, help="Path to COSE_Sign1 file")

    # submit
    sm = sub.add_parser("submit", help="Submit a COSE_Sign1 envelope to the ledger")
    sm.add_argument("--envelope", required=True, help="Path to COSE_Sign1 file")
    sm.add_argument("--ledger-url", default=None,
                    help="Ledger URL (e.g., https://<name>.confidential-ledger.azure.com). Uses LEDGER_URL env var if not set.")
    sm.add_argument("--scope", required=True, help="Scope (owner/name, e.g., contoso/firmware)")
    sm.add_argument("--token", help="Bearer token (default: fetches via az cli)")

    # policy
    pol = sub.add_parser("policy", help="View the policy for a scope on the ledger")
    pol.add_argument("--scope", required=True, help="Scope (owner/name, e.g., contoso/firmware)")
    pol.add_argument("--ledger-url", default=None,
                     help="Ledger URL (e.g., https://<name>.confidential-ledger.azure.com). Uses LEDGER_URL env var if not set.")

    args = parser.parse_args()
    if args.command == "keygen":
        cmd_keygen(args)
    elif args.command == "sign":
        cmd_sign(args)
    elif args.command == "inspect":
        cmd_inspect(args)
    elif args.command == "submit":
        cmd_submit(args)
    elif args.command == "policy":
        cmd_policy(args)


if __name__ == "__main__":
    main()
