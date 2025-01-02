import * as ccfapp from "@microsoft/ccf-app";
import { ccf } from "@microsoft/ccf-app/global";
import { ErrorResponse, errorResponse, Result, result_error } from "./common";
import {
  snp_attestation,
  SnpAttestationResult,
} from "@microsoft/ccf-app/global";
import { Base64 } from "js-base64";

interface UvmEndorsements {
  did: string;
  feed: string;
  svn: string;
}

interface ProcessorMetadata {
  measurement: string;
  uvm_endorsements: UvmEndorsements;
}

const userPolicies = ccfapp.typedKv("userPolicy", ccfapp.string, ccfapp.string);

const validProcessorUvm = ccfapp.typedKvSet(
  "validProcessorUvm",
  ccfapp.json<UvmEndorsements>()
);
const validProcessorMeasurement = ccfapp.typedKvSet(
  "validProcessorMeasurement",
  ccfapp.string
);
const validProcessors = ccfapp.typedKv(
  "validProcessors",
  ccfapp.string,
  ccfapp.checkedJson<ProcessorMetadata>()
);

export function getPolicy(usercert: string): string | undefined {
  return userPolicies.get(usercert);
}

export function getUserCert(
  request: ccfapp.Request<any>
): ccfapp.Response<string> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  return {
    body: callerId,
  };
}

interface ReqRegisterUserPolicy {
  cert: string;
  policy: string;
}

export function setUserPolicy(
  request: ccfapp.Request<ReqRegisterUserPolicy>
): ccfapp.Response {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  const actionPermitted = acl.authz.actionAllowed(callerId, "/policy/write");
  if (!actionPermitted) {
    return errorResponse(
      403,
      `${callerId} is not authorized to register user.`
    );
  }

  const validation = validateReqRegisterUserPolicy(request);
  if (!validation.ok) {
    return errorResponse(400, validation.value);
  }

  const body = request.body.json();

  // Note: cannot make user or processor 'users' as this requires write access to TPAL users
  //// Register user with roles
  //let userRolesMapHandle = ccf.kv[userRolesMapTable];
  //userRolesMapHandle.set(ccf.strToBuf(body.cert), ccf.strToBuf("[InsuranceUser]"))

  // Add policy
  userPolicies.set(body.cert, body.policy);

  return {
    statusCode: 200,
  };
}

export function getUserPolicy(
  request: ccfapp.Request<any>
): ccfapp.Response<string | ErrorResponse> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  if (!userPolicies.has(callerId)) {
    return errorResponse(400, "No policy found");
  }
  return {
    statusCode: 200,
    body: userPolicies.get(callerId),
  };
}

export function isValidProcessor(processor_cert: string): boolean {
  return validProcessors.has(processor_cert);
}

export function setProcessorUvmEndorsements(
  request: ccfapp.Request<UvmEndorsements>
): ccfapp.Response<any | ErrorResponse> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  const actionPermitted = acl.authz.actionAllowed(callerId, "/processor/write");
  if (!actionPermitted) {
    return errorResponse(
      403,
      `${callerId} is not authorized to set uvm endorsements.`
    );
  }

  let uvm_endorsements: UvmEndorsements;
  try {
    const body = request.body.json();
    if (!body.did || typeof body.did !== "string") {
      return errorResponse(400, "Invalid uvm did.");
    }
    if (!body.feed || typeof body.feed !== "string") {
      return errorResponse(400, "Invalid uvm feed.");
    }
    if (!body.svn || typeof body.svn !== "string") {
      return errorResponse(400, "Invalid uvm svn.");
    }
    uvm_endorsements = body;
  } catch (error) {
    return errorResponse(400, "Error while parsing uvm_endorsements.");
  }

  // Remove containers with different uvm endorsements
  if (!validProcessorUvm.has(uvm_endorsements)) {
    validProcessors.clear();
  }
  validProcessorUvm.clear();
  validProcessorUvm.add(uvm_endorsements);

  return {
    statusCode: 200,
  };
}

export function listProcessorMeasurements(
  request: ccfapp.Request
): ccfapp.Response<string | ErrorResponse> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  const actionPermitted = acl.authz.actionAllowed(callerId, "/processor/read");
  if (!actionPermitted) {
    return errorResponse(
      403,
      `${callerId} is not authorized to access measurements.`
    );
  }

  let acc = [];
  validProcessorMeasurement.forEach((measurement_b64: string, _) => {
    acc.push(measurement_b64);
  });
  return {
    statusCode: 200,
    body: `[${acc.join(",")}]`,
  };
}

export function addProcessorMeasurement(
  request: ccfapp.Request<string>
): ccfapp.Response<any | ErrorResponse> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  const actionPermitted = acl.authz.actionAllowed(callerId, "/processor/write");
  if (!actionPermitted) {
    return errorResponse(
      403,
      `${callerId} is not authorized to add measurements.`
    );
  }

  let processorMeasurement;
  try {
    if (!request.body || !Base64.isValid(request.body)) {
      return errorResponse(400, "Missing or malformed measurement.");
    }
    processorMeasurement = request.body;
  } catch (error) {
    return errorResponse(
      400,
      "An error occurred while processing measurement: " + error.message
    );
  }

  validProcessorMeasurement.add(processorMeasurement);

  return { statusCode: 200 };
}

export function deleteProcessorMeasurement(
  request: ccfapp.Request<string>
): ccfapp.Response<any | ErrorResponse> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  const actionPermitted = acl.authz.actionAllowed(callerId, "/processor/write");
  if (!actionPermitted) {
    return errorResponse(
      403,
      `${callerId} is not authorized to delete measurements.`
    );
  }

  let processorMeasurement;
  try {
    if (!request.body || !Base64.isValid(request.body)) {
      return errorResponse(400, "Missing or malformed measurement.");
    }
    processorMeasurement = request.body;
  } catch (error) {
    return errorResponse(
      400,
      "An error occurred while processing measurement: " + error.message
    );
  }

  validProcessorMeasurement.delete(processorMeasurement);

  return { statusCode: 200 };
}

interface ReqAddProcessor {
  attestation: string;
  platform_certificates: string;
  uvm_endorsements: string;
}

export function addProcessor(
  request: ccfapp.Request<ReqAddProcessor>
): ccfapp.Response<string | ErrorResponse> {
  let body;
  try {
    if (!request.body) {
      return errorResponse(400, "Request body undefined.");
    }
    body = request.body.json();
  } catch (error) {
    return errorResponse(400, "Failed while parsing body: " + error.message);
  }

  let evidence; // attestation report
  try {
    if (!body.attestation || typeof body.attestation !== "string") {
      return errorResponse(400, "Missing or invalid attestation.");
    }
    evidence = ccfapp
      .typedArray(Uint8Array)
      .encode(Base64.toUint8Array(body.attestation));
  } catch (error) {
    return errorResponse(
      400,
      "Exception while parsing attestation: " + error.message
    );
  }

  let endorsements; // platform_certificates
  try {
    if (
      !body.platform_certificates ||
      typeof body.platform_certificates !== "string"
    ) {
      return errorResponse(400, "Missing or invalid platform_certificates.");
    }
    endorsements = ccfapp
      .typedArray(Uint8Array)
      .encode(Base64.toUint8Array(body.platform_certificates));
  } catch (error) {
    return errorResponse(
      400,
      "Exception while parsing attestation: " + error.message
    );
  }

  let uvm_endorsements;
  try {
    if (!body.uvm_endorsements || typeof body.uvm_endorsements !== "string") {
      return errorResponse(400, "Missing or invalid uvm_endorsements.");
    }
    uvm_endorsements = ccfapp
      .typedArray(Uint8Array)
      .encode(Base64.toUint8Array(body.uvm_endorsements));
  } catch (error) {
    return errorResponse(
      400,
      "Exception while parsing attestation: " + error.message
    );
  }

  let attestation_result: SnpAttestationResult;
  try {
    attestation_result = snp_attestation.verifySnpAttestation(
      evidence,
      endorsements,
      uvm_endorsements
    );
  } catch (error) {
    return errorResponse(
      400,
      "Failed to verify attestation with error: " + error.message
    );
  }

  // Check that certificates match
  if (
    ccf.crypto.digest("SHA-512", request.caller.cert) !==
    attestation_result.attestation.report_data
  ) {
    return errorResponse(
      400,
      "Report data does not match SHA-512 hash of caller certificate."
    );
  }

  // Check that measurement is valid
  let measurement_b64 = Base64.fromUint8Array(
    ccfapp
      .typedArray(Uint8Array)
      .decode(attestation_result.attestation.measurement)
  );
  if (validProcessorMeasurement.has(measurement_b64)) {
    return errorResponse(400, "Attestation measurement is not valid.");
  }

  // Check that uvm is valid
  if (!validProcessorUvm.has(attestation_result.uvm_endorsements)) {
    return errorResponse(400, "UVM endorsements are invalid.");
  }

  const processorCertFingerprint =
    acl.certUtils.convertToAclFingerprintFormat();

  validProcessors.set(processorCertFingerprint, {
    measurement: measurement_b64,
    uvm_endorsements: attestation_result.uvm_endorsements,
  });

  return { statusCode: 200 };
}

export function verifyProcessor(processor_cert: string): boolean {
  return validProcessors.has(processor_cert);
}

function validateReqRegisterUserPolicy(
  req: ccfapp.Request<ReqRegisterUserPolicy>
): Result<string> {
  try {
    var body = req.body.json();
  } catch (error) {
    return result_error("Failed while parsing body: " + error.message);
  }
  if (!body.cert || typeof body.cert !== "string") {
    return result_error("Missing or invalid user certificate.");
  }
  if (!body.policy || typeof body.policy !== "string") {
    return result_error("Missing or invalid policy.");
  }
}
