# Adapted from CCF infrastructure

import datetime
from typing import Dict, Optional, Tuple

from cryptography.hazmat.bindings._rust import openssl as rust_openssl
load_pem_private_key = rust_openssl.keys.load_pem_private_key

from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import (
    load_pem_private_key,
    load_pem_public_key,
    Encoding,
    PrivateFormat,
    PublicFormat,
    NoEncryption,
)
from cryptography.x509.oid import NameOID

_RECOMMENDED_RSA_PUBLIC_EXPONENT = 65537

def generate_rsa_keypair(key_size: int) -> Tuple[str, str]:
    """Generates an RSA keypair, returning a Tuple of (pprivate key, public key)."""

    priv = rsa.generate_private_key(
        public_exponent=_RECOMMENDED_RSA_PUBLIC_EXPONENT,
        key_size=key_size,
        backend=default_backend(),
    )
    pub = priv.public_key()
    priv_pem = priv.private_bytes(
        Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()
    ).decode("ascii")
    pub_pem = pub.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode(
        "ascii"
    )
    return priv_pem, pub_pem


def generate_cert(
    priv_key_pem: str, cn: str = "dummy"  # pylint: disable=invalid-name
) -> str:
    priv = load_pem_private_key(priv_key_pem.encode("ascii"), None, default_backend())
    pub = priv.public_key()
    subject = issuer = x509.Name(
        [
            x509.NameAttribute(NameOID.COMMON_NAME, cn),
        ]
    )
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(pub)
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.utcnow())
        .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=10))
        .sign(priv, hashes.SHA256(), default_backend())
    )

    return cert.public_bytes(Encoding.PEM).decode("ascii")