import * as ccfapp from "@microsoft/ccf-app";
import { ccf } from "@microsoft/ccf-app/global";

// ============================================================
// KV Table Schema for Code Transparency Sample
//
// Tables:
//   app:scopes          — scope metadata, keyed by "{owner}/{scope}"
//   app:scope_policies  — policy config per scope, keyed by "{owner}/{scope}"
//   app:entries         — submitted entries that passed policy
//   app:entry_index     — per-scope entry listing for pagination
//   app:policy_changes  — audit log of policy changes
// ============================================================

// --- Scope Metadata ---

export interface ScopeInfo {
  owner: string;
  scope: string;
  createdAt: number; // Unix timestamp (seconds)
}

export const scopeTable = ccfapp.typedKv(
  "app:scopes",
  ccfapp.string, // key: "{owner}/{scope}"
  ccfapp.json<ScopeInfo>(),
);

// --- Policy Configuration ---

export interface PolicyConfig {
  issuerAllowlist?: string[]; // Allowed issuer DIDs
  signatureFreshness?: number; // Max age in seconds
  allowedAlgorithms?: string[]; // e.g. ["ES256", "ES384"]
  minimumSVN?: number; // Minimum security version number
  contentTypeFilter?: string[]; // Required content types
  requireAttestation?: boolean; // Require TEE attestation
}

export const policyTable = ccfapp.typedKv(
  "app:scope_policies",
  ccfapp.string, // key: "{owner}/{scope}"
  ccfapp.json<PolicyConfig>(),
);

// --- Ledger Entries ---

export interface LedgerEntry {
  scopeKey: string;        // "{owner}/{scope}"
  seqno: number;           // Per-scope sequence number

  // -- COSE_Sign1 envelope metadata --
  issuer: string;          // Issuer DID from protected header
  alg: string;             // Signing algorithm (ES256, PS256, etc.)
  kid?: string;            // Key identifier (optional)
  contentType: string;     // Content type of the payload
  issuedAt?: number;       // Claimed signing time (Unix seconds)
  svn?: number;            // Security version number (optional)
  feed?: string;           // SCITT feed identifier (optional)
  hasAttestation: boolean; // Whether TEE attestation was present

  // -- Submission context (added by the ledger) --
  submitterId: string;     // Authenticated identity of submitter (JWT oid / cert fingerprint)
  submittedAt: number;     // Server timestamp (Unix seconds)
  payloadHash: string;     // SHA-256 hex digest of payload
  policyHash: string;      // SHA-256 hex digest of policy config at submission time

  // -- Payload --
  payload: string;         // Raw payload (string or base64)
}

export const entryTable = ccfapp.typedKv(
  "app:entries",
  ccfapp.string, // key: "{owner}/{scope}:{seqno}"
  ccfapp.json<LedgerEntry>(),
);

// Per-scope sequence counter for generating entry keys
export const scopeSeqTable = ccfapp.typedKv(
  "app:scope_seq",
  ccfapp.string, // key: "{owner}/{scope}"
  ccfapp.uint32, // value: next sequence number
);

// --- Policy Change Audit Log ---

export interface PolicyChangeRecord {
  scopeKey: string;
  changedAt: number;
  changedBy: string; // Caller identity
  previousPolicy: PolicyConfig | null;
  newPolicy: PolicyConfig;
}

export const policyChangeTable = ccfapp.typedKv(
  "app:policy_changes",
  ccfapp.string, // key: "{owner}/{scope}:{seqno}"
  ccfapp.json<PolicyChangeRecord>(),
);

export const policyChangeSeqTable = ccfapp.typedKv(
  "app:policy_change_seq",
  ccfapp.string, // key: "{owner}/{scope}"
  ccfapp.uint32,
);

// --- Helper: build scope key ---

export function scopeKey(owner: string, scope: string): string {
  return `${owner}/${scope}`;
}

// --- Helper: build entry key ---

export function entryKey(scopeKey: string, seqno: number): string {
  return `${scopeKey}:${seqno}`;
}

// --- Helper: get next sequence number for a scope ---

export function nextSeqNo(
  seqTable: ccfapp.TypedKvMap<string, number>,
  key: string,
): number {
  const current = seqTable.has(key) ? seqTable.get(key)! : 0;
  const next = current + 1;
  seqTable.set(key, next);
  return next;
}

// --- Helper: compute SHA-256 hex hash of a JSON object ---

export function hashJson(obj: any): string {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  const buf = ccf.strToBuf(str);
  const hashBuf = ccf.crypto.digest("SHA-256", buf);
  const arr = new Uint8Array(hashBuf);
  let hex = "";
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, "0");
  }
  return hex;
}
