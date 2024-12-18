import * as ccfapp from "@microsoft/ccf-app";
import { ccf } from "@microsoft/ccf-app/global";
import { ErrorResponse, errorResponse } from "./common";
import { getPolicy, verifyProcessorAttestation } from "./config";
import { v4 as uuid } from "uuid";

const DIGEST_ALGORITHM = "SHA-256";

interface CaseMetadata {
  incident: ArrayBuffer;
  policy: ArrayBuffer;
}
const caseMetadata = ccfapp.typedKv("caseMetadata", ccfapp.string, ccfapp.json);

const caseDecision = ccfapp.typedKv("caseDecision", ccfapp.string, ccfapp.bool);

interface ReqAddIncident {
  incidentFingerprint: ArrayBuffer;
}
interface RespAddIncident {
  caseId: string;
  policy: string;
}
export function addIncident(
  request: ccfapp.Request<ReqAddIncident>
): ccfapp.Response<RespAddIncident | ErrorResponse> {
  const case_id = uuid();
  const policy = getPolicy();
  if (policy === undefined) {
    return errorResponse(400, "No policy found");
  }

  const incidentFingerprint = request.body.json().fingerprint;
  const policyFingerprint = ccfapp.crypto.digest("SHA-256", ccf.strToBuf(policy));

  caseMetadata.set(case_id, {
    incident: incidentFingerprint,
    policy: policyFingerprint,
  });

  return {
    statusCode: 200,
    body: {
      caseId: case_id,
      policy: policy,
    },
  };
}

export function getMetadata(
  request: ccfapp.Request
): ccfapp.Response<CaseMetadata | ErrorResponse> {
  const caseId = request.params["caseId"];
  const metadata = caseMetadata.get(caseId);
  if (metadata === undefined) {
    return errorResponse(400, "Case number not found");
  }
  return {
    statusCode: 200,
    body: metadata,
  };
}

interface ReqPutIncidentDecision {
  caseId: string;
  incidentFingerprint: string;
  policyFingerprint: string;
  decision: boolean;
  attestation: ArrayBuffer;
}
export function putCaseDecision(
  request: ccfapp.Request<ReqPutIncidentDecision>
): ccfapp.Response<any | ErrorResponse> {
  const body = request.body.json();

  const caseId = request.params["caseId"];

  const metadata = caseMetadata.get(caseId);
  if (metadata === undefined) {
    return errorResponse(400, "Case number not found.");
  }

  if (!(metadata.incident === body.incidentFingerprint)) {
    return errorResponse(400, "Incident fingerprint does not match.");
  }
  if (!(metadata.policy === body.policyFingerprint)) {
    return errorResponse(400, "Policy fingerprint not match.");
  }
  if (!verifyProcessorAttestation(body.attestation)) {
    return errorResponse(400, "Invalid attestation.");
  }
  // TODO verify attested fingerprints and decision matches

  if (caseDecision.has(caseId)){
    return errorResponse(400, "Already stored decision");
  }

  caseDecision.set(caseId, body.decision);
  return {
    statusCode: 200,
  };
}

export function getCaseDecision(
  request: ccfapp.Request
): ccfapp.Response<boolean | ErrorResponse> {
  const caseId = request.params["caseId"];
  if (!caseMetadata.has(caseId)) {
    return errorResponse(400, "Unknown case id.");
  }
  const decision = caseDecision.get(caseId);
  if (decision === undefined) {
    return errorResponse(400, "Not yet received the decision from processor.");
  }

  const prevVersion = caseDecision.getVersionOfPreviousWrite(caseId);
  // TODO turn into a receipt

  return {
    statusCode: 200,
    body: {
      decision: decision ? "Approved" : "Rejected",
      decisionVersion: prevVersion
    },
  };
}
