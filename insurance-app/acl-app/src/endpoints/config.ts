import * as ccfapp from "@microsoft/ccf-app";
import { ccf } from "@microsoft/ccf-app/global";
import { ErrorResponse, errorResponse, Result, result_error } from "./common";
import {
  snp_attestation,
  SnpAttestationResult,
} from "@microsoft/ccf-app/global";
import { Base64 } from "js-base64";

const SINGLETON_KEY = 'default'

interface UvmEndorsements {
  did: string;
  feed: string;
  svn: string;
}

interface ValidProcessorProperties {
  uvm_endorsements : UvmEndorsements,
  measurement : string[],
  policy : string[]
}

interface ProcessorProperties {
  uvm_endorsements: UvmEndorsements;
  measurement: string;
  policy : string
}

const userPolicies = ccfapp.typedKv("userPolicy", ccfapp.string, ccfapp.string);
const validProcessorProperties = ccfapp.typedKv("validProcessorProperties", ccfapp.string, ccfapp.json<ValidProcessorProperties>());
const processors = ccfapp.typedKv(
  "validProcessors",
  ccfapp.string,
  ccfapp.checkedJson<ProcessorProperties>()
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
  let properties = processors.get(processor_cert);
  return isValidProcessorProperties(properties);
}

function isValidProcessorProperties(properties: ProcessorProperties) : boolean {
  let valid_properties = validProcessorProperties.get(SINGLETON_KEY)
  if (properties.uvm_endorsements !== valid_properties.uvm_endorsements) {
    return false
  }
  if (!valid_properties.measurement.includes(properties.measurement)) {
    return false
  }
  if (!valid_properties.policy.includes(properties.policy)) {
    return false
  }
  return true;
}

export function setValidProcessorPolicy(
  request: ccfapp.Request<ValidProcessorProperties>
) : ccfapp.Response<any | ErrorResponse> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  const actionPermitted = acl.authz.actionAllowed(callerId, "/processor/write");

  if (!actionPermitted) {
    return errorResponse(
      403,
      `${callerId} is not authorized to set uvm endorsements.`
    );
  }

  let properties: ValidProcessorProperties;
  try {
    const body = request.body.json();
    if (!body.uvm_endorsements) {
      return errorResponse(400, "Missing uvm endorsements");
    }
    if (!body.uvm_endorsements.did || typeof body.uvm_endorsements.did !== "string") {
      return errorResponse(400, "Invalid uvm did.");
    }
    if (!body.uvm_endorsements.feed || typeof body.uvm_endorsements.feed !== "string") {
      return errorResponse(400, "Invalid uvm feed.");
    }
    if (!body.uvm_endorsements.svn || typeof body.uvm_endorsements.svn !== "string") {
      return errorResponse(400, "Invalid uvm svn.");
    }
    properties.uvm_endorsements = body.uvm_endorsements;

    if(!body.measurement || !Array.isArray(body.measurement) || !body.measurement.every(item => typeof item === 'string')) {
      return errorResponse(400, "Invalid or missing measurement")
    }
    if(!body.policy || !Array.isArray(body.policy) || !body.policy.every(item => typeof item === 'string')) {
      return errorResponse(400, "Invalid or missing measurement")
    }
    properties = body;
  } catch (error) {
    return errorResponse(400, "Error while parsing properties");
  }

  validProcessorProperties.set(SINGLETON_KEY, properties);
}

export function getValidProcessorPolicy(
  request: ccfapp.Request
) : ccfapp.Response<ValidProcessorProperties> {
  return {
    statusCode: 200,
    body : validProcessorProperties.get(SINGLETON_KEY)
  }
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

  return errorResponse(400, "DEBUG:" + JSON.stringify(attestation_result))

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

  let measurement_b64 = Base64.fromUint8Array(
    ccfapp
      .typedArray(Uint8Array)
      .decode(attestation_result.attestation.measurement)
  );
  let policy_b64 = Base64.fromUint8Array(
    ccfapp
      .typedArray(Uint8Array)
      .decode(attestation_result.attestation.host_data)
  );
  let properties = {
    uvm_endorsements: uvm_endorsements,
    measurement : measurement_b64,
    policy : policy_b64,
  }
  if (!isValidProcessorProperties(properties)){
    return errorResponse(400, "Properties of container are invalid");
  }

  const processorCertFingerprint =
    acl.certUtils.convertToAclFingerprintFormat();
  processors.set(processorCertFingerprint, properties);

  return { statusCode: 200 };
}

export function verifyProcessor(processor_cert: string): boolean {
  return processors.has(processor_cert);
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
