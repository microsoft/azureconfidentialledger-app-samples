import * as ccfapp from "@microsoft/ccf-app";
import { ccf } from "@microsoft/ccf-app/global";
import {
  scopeTable,
  policyTable,
  entryTable,
  scopeSeqTable,
  scopeKey,
  entryKey as buildEntryKey,
  nextSeqNo,
  hashJson,
  LedgerEntry,
  PolicyConfig,
} from "../models/schema";
import {
  errorResponse,
  successResponse,
  getCallerId,
  log,
  logError,
  nowUnixSeconds,
} from "./common";
import { evaluatePolicy, ClaimHeaders } from "../policies/engine";

// POST /scopes/{owner}/{scope}/entries — Submit a signed statement
export function submitEntry(request: ccfapp.Request): ccfapp.Response {
  const owner = request.params["owner"];
  const scope = request.params["scope"];
  const key = scopeKey(owner, scope);
  const callerId = getCallerId(request);
  log("submitEntry", "Request received", { scopeKey: key, caller: callerId });

  if (!scopeTable.has(key)) {
    logError("submitEntry", "Scope not found", { scopeKey: key });
    return errorResponse(404, `Scope not found: ${key}`);
  }

  // Parse submission body
  let body: any;
  try {
    body = request.body.json();
  } catch {
    logError("submitEntry", "Invalid JSON body", { scopeKey: key });
    return errorResponse(400, "Invalid JSON body");
  }

  if (!body.payload) {
    logError("submitEntry", "Missing payload field", { scopeKey: key });
    return errorResponse(400, "Missing 'payload' field");
  }

  // Extract claim headers from the submission
  const claimHeaders: ClaimHeaders = {
    alg: body.headers?.alg,
    issuer: body.headers?.issuer,
    contentType: body.headers?.contentType,
    issuedAt: body.headers?.issuedAt,
    svn: body.headers?.svn,
    hasAttestation: body.headers?.hasAttestation ?? false,
  };
  const kid: string | undefined = body.headers?.kid;
  const feed: string | undefined = body.headers?.feed;
  log("submitEntry", "Claim headers extracted", {
    scopeKey: key,
    issuer: claimHeaders.issuer,
    alg: claimHeaders.alg,
    kid,
    contentType: claimHeaders.contentType,
    issuedAt: claimHeaders.issuedAt,
    svn: claimHeaders.svn,
    feed,
    hasAttestation: claimHeaders.hasAttestation,
  });

  // Look up scope policy and evaluate
  const policy: PolicyConfig = policyTable.has(key) ? policyTable.get(key)! : {};
  log("submitEntry", "Policy loaded for evaluation", {
    scopeKey: key,
    activePolicies: Object.keys(policy).filter((k) => policy[k as keyof PolicyConfig] !== undefined),
  });

  const result = evaluatePolicy(claimHeaders, policy);

  if (!result.passed) {
    logError("submitEntry", "Policy check FAILED", {
      scopeKey: key,
      caller: callerId,
      errors: result.errors,
    });
    return errorResponse(403, `Policy check failed: ${result.errors.join("; ")}`);
  }
  log("submitEntry", "Policy check PASSED", { scopeKey: key, caller: callerId });

  // Compute payload hash
  const payloadBytes = ccf.strToBuf(body.payload);
  const hashBuf = ccf.crypto.digest("SHA-256", payloadBytes);
  const hashArray = new Uint8Array(hashBuf);
  let payloadHash = "";
  for (let i = 0; i < hashArray.length; i++) {
    payloadHash += hashArray[i].toString(16).padStart(2, "0");
  }
  log("submitEntry", "Payload hash computed", { scopeKey: key, payloadHash });

  // Persist the entry
  const seqno = nextSeqNo(scopeSeqTable, key);
  const entryId = buildEntryKey(key, seqno);
  const nowSeconds = nowUnixSeconds();
  const policyHash = hashJson(policy);

  const entry: LedgerEntry = {
    scopeKey: key,
    seqno,

    // COSE_Sign1 envelope metadata
    issuer: claimHeaders.issuer || "unknown",
    alg: claimHeaders.alg || "unknown",
    kid,
    contentType: claimHeaders.contentType || "application/octet-stream",
    issuedAt: claimHeaders.issuedAt,
    svn: claimHeaders.svn,
    feed,
    hasAttestation: claimHeaders.hasAttestation || false,

    // Submission context
    submitterId: callerId,
    submittedAt: nowSeconds,
    payloadHash,
    policyHash,

    // Payload
    payload: body.payload,
  };

  entryTable.set(entryId, entry);
  log("submitEntry", "Entry persisted to KV", {
    entryId,
    scopeKey: key,
    seqno,
    submitterId: callerId,
    submittedAt: nowSeconds,
    issuer: entry.issuer,
    alg: entry.alg,
    contentType: entry.contentType,
    payloadHash,
    policyHash,
  });

  return successResponse(
    {
      entryId,
      scopeKey: key,
      seqno,
      submitterId: callerId,
      submittedAt: nowSeconds,
      payloadHash,
      policyHash,
      policyResult: result,
    },
    201,
  );
}

// GET /scopes/{owner}/{scope}/entries/{seqno} — Get a single entry
export function getEntry(request: ccfapp.Request): ccfapp.Response {
  const owner = request.params["owner"];
  const scope = request.params["scope"];
  const seqno = request.params["seqno"];
  const key = scopeKey(owner, scope);
  log("getEntry", "Request received", { scopeKey: key, seqno });

  if (!scopeTable.has(key)) {
    logError("getEntry", "Scope not found", { scopeKey: key });
    return errorResponse(404, `Scope not found: ${key}`);
  }

  const entryId = `${key}:${seqno}`;

  if (!entryTable.has(entryId)) {
    logError("getEntry", "Entry not found", { entryId });
    return errorResponse(404, `Entry not found: ${entryId}`);
  }

  const entry = entryTable.get(entryId);
  log("getEntry", "Returning entry", { entryId });
  return successResponse({ entryId, ...entry });
}

// GET /scopes/{owner}/{scope}/verify — Get latest entry (optionally filtered by feed)
// Used by clients to fetch the current "ground truth" measurements for verification
export function verifyFeed(request: ccfapp.Request): ccfapp.Response {
  const owner = request.params["owner"];
  const scope = request.params["scope"];
  const key = scopeKey(owner, scope);
  log("verifyFeed", "Request received", { scopeKey: key });

  if (!scopeTable.has(key)) {
    logError("verifyFeed", "Scope not found", { scopeKey: key });
    return errorResponse(404, `Scope not found: ${key}`);
  }

  // Parse optional feed filter from query string
  const query = request.query || "";
  const params = new Map<string, string>();
  query.split("&").forEach((part: string) => {
    const [k, v] = part.split("=");
    if (k) params.set(decodeURIComponent(k), decodeURIComponent(v || ""));
  });
  const feedFilter = params.get("feed") || null;
  log("verifyFeed", "Filter params", { scopeKey: key, feedFilter });

  const maxSeq = scopeSeqTable.has(key) ? scopeSeqTable.get(key)! : 0;

  // Walk backwards to find the latest matching entry
  for (let i = maxSeq; i >= 1; i--) {
    const entryId = buildEntryKey(key, i);
    if (!entryTable.has(entryId)) continue;

    const entry = entryTable.get(entryId)!;

    // If feed filter is set, skip non-matching entries
    if (feedFilter && entry.feed !== feedFilter) continue;

    // Parse payload as JSON if possible for structured measurements
    let measurements: any = null;
    try {
      measurements = JSON.parse(entry.payload);
    } catch {
      // Payload isn't JSON — leave measurements null
    }

    log("verifyFeed", "Returning latest entry", { scopeKey: key, seqno: i, feed: entry.feed });
    return successResponse({
      scopeKey: key,
      feed: entry.feed || null,
      latest: {
        entryId,
        seqno: i,
        issuer: entry.issuer,
        alg: entry.alg,
        contentType: entry.contentType,
        submittedAt: entry.submittedAt,
        payloadHash: entry.payloadHash,
        svn: entry.svn,
      },
      measurements,
      verification: {
        entryId,
        payloadHash: entry.payloadHash,
        policyHash: entry.policyHash,
        submitterId: entry.submitterId,
      },
    });
  }

  const msg = feedFilter
    ? `No entries found for feed: ${feedFilter}`
    : "No entries found in this scope";
  logError("verifyFeed", msg, { scopeKey: key, feedFilter });
  return errorResponse(404, msg);
}

// GET /scopes/{owner}/{scope}/entries — List entries for a scope
export function listEntries(request: ccfapp.Request): ccfapp.Response {
  const owner = request.params["owner"];
  const scope = request.params["scope"];
  const key = scopeKey(owner, scope);
  log("listEntries", "Request received", { scopeKey: key });

  if (!scopeTable.has(key)) {
    logError("listEntries", "Scope not found", { scopeKey: key });
    return errorResponse(404, `Scope not found: ${key}`);
  }

  const maxSeq = scopeSeqTable.has(key) ? scopeSeqTable.get(key)! : 0;

  // Parse pagination from query string
  const query = request.query || "";
  const params = new Map<string, string>();
  query.split("&").forEach((part: string) => {
    const [k, v] = part.split("=");
    if (k) params.set(decodeURIComponent(k), decodeURIComponent(v || ""));
  });

  const pageSize = Math.min(parseInt(params.get("pageSize") || "50"), 100);
  const startAfter = parseInt(params.get("startAfter") || "0");
  log("listEntries", "Pagination params", { scopeKey: key, maxSeq, pageSize, startAfter });

  const entries: any[] = [];
  for (let i = startAfter + 1; i <= maxSeq && entries.length < pageSize; i++) {
    const entryId = buildEntryKey(key, i);
    if (entryTable.has(entryId)) {
      const entry = entryTable.get(entryId);
      entries.push({
        entryId,
        seqno: i,
        submittedAt: entry!.submittedAt,
        issuer: entry!.issuer,
        alg: entry!.alg || "unknown",
        contentType: entry!.contentType,
        payloadHash: entry!.payloadHash,
        submitterId: entry!.submitterId || "unknown",
      });
    }
  }

  log("listEntries", "Returning entries", { scopeKey: key, returned: entries.length, totalEntries: maxSeq });
  return successResponse({
    scopeKey: key,
    entries,
    totalEntries: maxSeq,
    pageSize,
    hasMore: startAfter + pageSize < maxSeq,
  });
}
