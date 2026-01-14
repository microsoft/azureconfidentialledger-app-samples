import "@microsoft/ccf-app/global";

declare module "@microsoft/ccf-app/global" {
  interface CCF {
    /**
     * Computes a SHA-256 digest of a PEM-encoded certificate and returns it as a hex string.
     * This is used as a unique identifier for the certificate.
     * @param pem A PEM-encoded X.509 certificate
     * @returns Hex-encoded SHA-256 fingerprint of the certificate
     */
    pemToId(pem: string): string;
  }
}
