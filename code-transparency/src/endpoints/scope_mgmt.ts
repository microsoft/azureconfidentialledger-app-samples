import * as ccfapp from "@microsoft/ccf-app";
import {
  scopeTable,
  policyTable,
  scopeSeqTable,
  scopeKey,
  ScopeInfo,
  PolicyConfig,
  policyChangeTable,
  policyChangeSeqTable,
  nextSeqNo,
  entryKey as buildEntryKey,
} from "../models/schema";
import {
  errorResponse,
  successResponse,
  getCallerId,
  validateName,
  log,
  logError,
  nowUnixSeconds,
} from "./common";

// POST /scopes/{owner}/{scope} — Create a new scope with policy config
export function createScope(
  request: ccfapp.Request<{ policy: PolicyConfig }>,
): ccfapp.Response {
  const owner = request.params["owner"];
  const scope = request.params["scope"];
  log("createScope", "Request received", { owner, scope });

  const ownerErr = validateName(owner, "owner");
  if (ownerErr) {
    logError("createScope", "Validation failed", { owner, error: ownerErr });
    return errorResponse(400, ownerErr);
  }
  const scopeErr = validateName(scope, "scope");
  if (scopeErr) {
    logError("createScope", "Validation failed", { scope, error: scopeErr });
    return errorResponse(400, scopeErr);
  }

  const key = scopeKey(owner, scope);

  if (scopeTable.has(key)) {
    logError("createScope", "Scope already exists", { scopeKey: key });
    return errorResponse(409, `Scope already exists: ${key}`);
  }

  const body = request.body.json();
  const policy = body.policy || {};
  log("createScope", "Policy config parsed", { scopeKey: key, policyKeys: Object.keys(policy) });

  const scopeInfo: ScopeInfo = {
    owner,
    scope,
    createdAt: nowUnixSeconds(),
  };

  scopeTable.set(key, scopeInfo);
  policyTable.set(key, policy);
  log("createScope", "Scope and policy written to KV", { scopeKey: key });

  // Log the initial policy as a change record
  const callerId = getCallerId(request);
  const changeSeqNo = nextSeqNo(policyChangeSeqTable, key);
  policyChangeTable.set(buildEntryKey(key, changeSeqNo), {
    scopeKey: key,
    changedAt: scopeInfo.createdAt,
    changedBy: callerId,
    previousPolicy: null,
    newPolicy: policy,
  });
  log("createScope", "Policy change audit record written", { scopeKey: key, changeSeqNo, changedBy: callerId });

  log("createScope", "Scope created successfully", { scopeKey: key, createdAt: scopeInfo.createdAt });
  return successResponse(
    {
      scopeKey: key,
      policy,
      createdAt: scopeInfo.createdAt,
    },
    201,
  );
}

// GET /scopes/{owner}/{scope}/policy — View current policy for a scope
export function getPolicy(request: ccfapp.Request): ccfapp.Response {
  const owner = request.params["owner"];
  const scope = request.params["scope"];
  const key = scopeKey(owner, scope);
  log("getPolicy", "Request received", { scopeKey: key });

  if (!scopeTable.has(key)) {
    logError("getPolicy", "Scope not found", { scopeKey: key });
    return errorResponse(404, `Scope not found: ${key}`);
  }

  const policy = policyTable.has(key) ? policyTable.get(key) : {};
  log("getPolicy", "Returning policy", { scopeKey: key });

  return successResponse({ scopeKey: key, policy });
}

// PATCH /scopes/{owner}/{scope}/policy — Update policy for a scope
export function updatePolicy(
  request: ccfapp.Request<{ policy: PolicyConfig }>,
): ccfapp.Response {
  const owner = request.params["owner"];
  const scope = request.params["scope"];
  const key = scopeKey(owner, scope);
  log("updatePolicy", "Request received", { scopeKey: key });

  if (!scopeTable.has(key)) {
    logError("updatePolicy", "Scope not found", { scopeKey: key });
    return errorResponse(404, `Scope not found: ${key}`);
  }

  const body = request.body.json();
  const newPolicy = body.policy;
  if (!newPolicy) {
    logError("updatePolicy", "Missing policy in request body", { scopeKey: key });
    return errorResponse(400, "Missing 'policy' in request body");
  }

  const previousPolicy = policyTable.has(key) ? policyTable.get(key) : null;
  policyTable.set(key, newPolicy);
  log("updatePolicy", "Policy updated in KV", { scopeKey: key, newPolicyKeys: Object.keys(newPolicy) });

  // Log the policy change
  const callerId = getCallerId(request);
  const changeSeqNo = nextSeqNo(policyChangeSeqTable, key);
  policyChangeTable.set(buildEntryKey(key, changeSeqNo), {
    scopeKey: key,
    changedAt: nowUnixSeconds(),
    changedBy: callerId,
    previousPolicy: previousPolicy ?? null,
    newPolicy,
  });
  log("updatePolicy", "Policy change audit record written", { scopeKey: key, changeSeqNo, changedBy: callerId });

  log("updatePolicy", "Policy updated successfully", { scopeKey: key });
  return successResponse({ scopeKey: key, policy: newPolicy });
}

// GET /scopes — List all scopes
export function listScopes(
  _request: ccfapp.Request,
): ccfapp.Response {
  log("listScopes", "Request received", {});

  const scopes: Array<ScopeInfo & { entryCount: number; policy: PolicyConfig }> = [];

  scopeTable.forEach((info, key) => {
    const policy = policyTable.has(key) ? policyTable.get(key)! : {};
    const entryCount = scopeSeqTable.has(key) ? scopeSeqTable.get(key)! : 0;
    scopes.push({ ...info, entryCount, policy });
  });

  log("listScopes", "Returning scopes", { count: scopes.length });
  return successResponse({ scopes, total: scopes.length });
}

// GET /scopes/{owner}/{scope} — Get scope info
export function getScope(request: ccfapp.Request): ccfapp.Response {
  const owner = request.params["owner"];
  const scope = request.params["scope"];
  const key = scopeKey(owner, scope);
  log("getScope", "Request received", { scopeKey: key });

  if (!scopeTable.has(key)) {
    logError("getScope", "Scope not found", { scopeKey: key });
    return errorResponse(404, `Scope not found: ${key}`);
  }

  const scopeInfo = scopeTable.get(key);
  const policy = policyTable.has(key) ? policyTable.get(key) : {};
  log("getScope", "Returning scope info", { scopeKey: key });

  return successResponse({ ...scopeInfo, policy });
}
