import { PolicyConfig } from "../models/schema";
import { log, nowUnixSeconds } from "../endpoints/common";

// Each policy block is a function that takes the COSE protected header info
// and returns null on success or an error string on failure.

export interface ClaimHeaders {
  alg?: string;
  issuer?: string;
  contentType?: string;
  issuedAt?: number; // Unix timestamp seconds
  svn?: number;
  hasAttestation?: boolean;
}

type PolicyCheck = (
  headers: ClaimHeaders,
  config: PolicyConfig,
) => string | null;

// --- Individual Policy Blocks ---

function checkIssuerAllowlist(
  headers: ClaimHeaders,
  config: PolicyConfig,
): string | null {
  if (!config.issuerAllowlist || config.issuerAllowlist.length === 0) {
    return null;
  }
  if (!headers.issuer) {
    return "Missing issuer";
  }
  if (!config.issuerAllowlist.includes(headers.issuer)) {
    return `Issuer not in allowlist: ${headers.issuer}`;
  }
  return null;
}

function checkSignatureFreshness(
  headers: ClaimHeaders,
  config: PolicyConfig,
): string | null {
  if (!config.signatureFreshness) {
    return null;
  }
  if (!headers.issuedAt) {
    return "Missing issued-at timestamp";
  }
  // CCF returns 0 for Date.now() unless untrusted host time is enabled
  const nowSeconds = nowUnixSeconds();
  const age = nowSeconds - headers.issuedAt;
  if (age > config.signatureFreshness) {
    return `Signature too old: ${age}s exceeds max ${config.signatureFreshness}s`;
  }
  if (age < 0) {
    return "Signature issued in the future";
  }
  return null;
}

function checkAllowedAlgorithms(
  headers: ClaimHeaders,
  config: PolicyConfig,
): string | null {
  if (!config.allowedAlgorithms || config.allowedAlgorithms.length === 0) {
    return null;
  }
  if (!headers.alg) {
    return "Missing algorithm";
  }
  if (!config.allowedAlgorithms.includes(headers.alg)) {
    return `Algorithm not allowed: ${headers.alg}`;
  }
  return null;
}

function checkMinimumSVN(
  headers: ClaimHeaders,
  config: PolicyConfig,
): string | null {
  if (config.minimumSVN === undefined) {
    return null;
  }
  if (headers.svn === undefined) {
    return "Missing security version number (SVN)";
  }
  if (headers.svn < config.minimumSVN) {
    return `SVN ${headers.svn} below minimum ${config.minimumSVN}`;
  }
  return null;
}

function checkContentTypeFilter(
  headers: ClaimHeaders,
  config: PolicyConfig,
): string | null {
  if (!config.contentTypeFilter || config.contentTypeFilter.length === 0) {
    return null;
  }
  if (!headers.contentType) {
    return "Missing content type";
  }
  if (!config.contentTypeFilter.includes(headers.contentType)) {
    return `Content type not allowed: ${headers.contentType}`;
  }
  return null;
}

function checkTEEAttestation(
  headers: ClaimHeaders,
  config: PolicyConfig,
): string | null {
  if (!config.requireAttestation) {
    return null;
  }
  if (!headers.hasAttestation) {
    return "TEE attestation required but not present";
  }
  return null;
}

// --- Compose all checks ---

const ALL_CHECKS: PolicyCheck[] = [
  checkIssuerAllowlist,
  checkSignatureFreshness,
  checkAllowedAlgorithms,
  checkMinimumSVN,
  checkContentTypeFilter,
  checkTEEAttestation,
];

export interface PolicyResult {
  passed: boolean;
  errors: string[];
}

export function evaluatePolicy(
  headers: ClaimHeaders,
  config: PolicyConfig,
): PolicyResult {
  const errors: string[] = [];

  for (const check of ALL_CHECKS) {
    const error = check(headers, config);
    if (error) {
      log("policyEngine", `Check failed: ${error}`);
      errors.push(error);
    }
  }

  log("policyEngine", `Evaluation complete: ${errors.length === 0 ? "PASSED" : "FAILED"}`, {
    checksRun: ALL_CHECKS.length,
    errorCount: errors.length,
  });

  return {
    passed: errors.length === 0,
    errors,
  };
}

// --- Policy catalog: describe available policies ---

export interface PolicyBlockInfo {
  name: string;
  description: string;
  parameterType: string;
  example: any;
}

export function getPolicyCatalog(): PolicyBlockInfo[] {
  return [
    {
      name: "issuerAllowlist",
      description: "Only accept claims from specified issuer DIDs",
      parameterType: "string[]",
      example: ["did:x509:0:sha256:abc...::eku:1.3.6.1.4.1.311.10.3.13"],
    },
    {
      name: "signatureFreshness",
      description:
        "Reject signatures older than the specified age (in seconds)",
      parameterType: "number",
      example: 86400,
    },
    {
      name: "allowedAlgorithms",
      description: "Restrict to specific COSE signing algorithms",
      parameterType: "string[]",
      example: ["ES256", "ES384", "PS256"],
    },
    {
      name: "minimumSVN",
      description: "Require a minimum security version number",
      parameterType: "number",
      example: 3,
    },
    {
      name: "contentTypeFilter",
      description: "Only accept specific content types",
      parameterType: "string[]",
      example: ["application/spdx+json", "application/vnd.cyclonedx+json"],
    },
    {
      name: "requireAttestation",
      description: "Require TEE attestation on submitted claims",
      parameterType: "boolean",
      example: true,
    },
  ];
}
