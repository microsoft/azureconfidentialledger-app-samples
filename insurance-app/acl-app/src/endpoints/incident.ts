import * as ccfapp from "@microsoft/ccf-app";
import {
  ErrorResponse,
  errorResponse,
  Result,
  result_ok,
  result_error,
} from "./common";
import { getPolicy, isValidProcessor } from "./config";

const DIGEST_ALGORITHM = "SHA-256";

const kvCaseId = ccfapp.typedKv("caseId", ccfapp.string, ccfapp.int32);

interface CaseMetadata {
  incident: string;
  policy: string;
}
const caseMetadata = ccfapp.typedKv(
  "caseMetadata",
  ccfapp.string,
  ccfapp.json<CaseMetadata>()
);

const caseDecision = ccfapp.typedKv(
  "caseDecision",
  ccfapp.string,
  ccfapp.float32
);

interface ReqAddIncident {
  incidentFingerprint: string;
}
interface RespAddIncident {
  caseId: string;
  policy: string;
}
export function addIncident(
  request: ccfapp.Request<ReqAddIncident>
): ccfapp.Response<RespAddIncident | ErrorResponse> {
  const validation = validateReqAddIncident(request);
  if (!validation.ok) {
    return errorResponse(400, validation.value);
  }

  var case_id_int = kvCaseId.get("default");
  if (case_id_int === undefined) {
    case_id_int = 0;
  }
  kvCaseId.set("default", case_id_int + 1);
  const case_id = String(case_id_int);

  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  const policy = getPolicy(callerId);
  if (policy === undefined) {
    return errorResponse(400, "No policy found");
  }

  const incidentFingerprint = request.body.json().incidentFingerprint;

  caseMetadata.set(case_id, {
    incident: incidentFingerprint,
    policy: policy,
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
  const validation = validateGetMetadata(request);
  if (!validation.ok) {
    return errorResponse(400, validation.value);
  }

  const caseId = request.params["caseId"];
  const metadata: CaseMetadata = caseMetadata.get(caseId);
  if (metadata === undefined) {
    return errorResponse(400, "Case number not found");
  }
  return {
    statusCode: 200,
    body: metadata,
  };
}

interface ReqPutIncidentDecision {
  incidentFingerprint: string;
  policy: string;
  decision: number;
}
export function putCaseDecision(
  request: ccfapp.Request<ReqPutIncidentDecision>
): ccfapp.Response<any | ErrorResponse> {
  const validation = validateReqPutIncidentDecision(request);
  if (!validation.ok) {
    return errorResponse(400, validation.value);
  }

  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  if (!isValidProcessor(callerId)) {
    return errorResponse(403, "Processor invalid");
  }

  const body = request.body.json();
  const caseId = request.params["caseId"];

  const metadata = caseMetadata.get(caseId);
  if (metadata === undefined) {
    return errorResponse(400, "Case number not found.");
  }

  if (!(metadata.incident === body.incidentFingerprint)) {
    return errorResponse(400, "Incident fingerprint does not match.");
  }
  if (!(metadata.policy === body.policy)) {
    return errorResponse(400, "Policy fingerprint not match.");
  }
  if (caseDecision.has(caseId)) {
    return errorResponse(400, "Already stored decision");
  }

  caseDecision.set(caseId, body.decision);
  return {
    statusCode: 200,
  };
}

export function getCaseDecision(
  request: ccfapp.Request
): ccfapp.Response<
  { decision: string; decisionVersion: number } | ErrorResponse
> {
  const validation = valdiateGetCaseDecision(request);
  if (!validation.ok) {
    return errorResponse(400, validation.value);
  }
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

  if (decision > 0) {
    return {
      statusCode: 200,
      body: {
        decision: `Approved for ${decision} USD`,
        decisionVersion: prevVersion,
      },
    };
  } else {
    return {
      statusCode: 200,
      body: {
        decision: `Denied`,
        decisionVersion: prevVersion,
      },
    };
  }
}

function validateReqAddIncident(
  req: ccfapp.Request<ReqAddIncident>
): Result<string> {
  try {
    var body = req.body.json();
  } catch (error) {
    return result_error("Failed while parsing body: " + error.message);
  }
  if (
    !body.incidentFingerprint ||
    typeof body.incidentFingerprint !== "string"
  ) {
    return result_error("Missing or invalid incidentFingerprint.");
  }
  return result_ok();
}

function validateGetMetadata(req: ccfapp.Request): Result<string> {
  const caseId = req.params["caseId"];
  if (!caseId || typeof caseId !== "string") {
    return result_error("Missing or invalid caseId in parameters.");
  }
  return result_ok();
}

function validateReqPutIncidentDecision(
  req: ccfapp.Request<ReqPutIncidentDecision>
): Result<string> {
  try {
    var body = req.body.json();
  } catch (error) {
    return result_error("Failed while parsing body: " + error.message);
  }
  if (
    !body.incidentFingerprint ||
    typeof body.incidentFingerprint !== "string"
  ) {
    return result_error("Missing or invalid incidentFingerprint.");
  }
  if (!body.policy || typeof body.policy !== "string") {
    return result_error("Missing or invalid policy.");
  }
  if (!body.decision || typeof body.decision != "number") {
    return result_error("Missing or invalid decision.");
  }
  return result_ok();
}

function valdiateGetCaseDecision(req: ccfapp.Request): Result<string> {
  const caseId = req.params["caseId"];
  if (!caseId || typeof caseId !== "string") {
    return result_error("Missing or invalid caseId in parameters.");
  }
  return result_ok();
}
