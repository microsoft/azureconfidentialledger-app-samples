import * as ccfapp from "@microsoft/ccf-app";
import { ccf } from "@microsoft/ccf-app/global";
import { ErrorResponse, errorResponse } from "./common";


const userRolesMapTable = "public:confidentialledger.roles.user_roles_mapping";
const userPolicies = ccfapp.typedKv("userPolicy", ccfapp.string, ccfapp.string)
const validProcessors = ccfapp.typedKv("validProcessor", ccfapp.string, ccfapp.bool)

export function dumpTable(request: ccfapp.Request<any>) : ccfapp.Response<string> {
  const table = [];
  ccf.kv[userRolesMapTable].forEach((value, key, kvmap) =>
    table.push(`${ccf.bufToStr(key)}: ${ccf.bufToStr(value)}`)
  )

  return {
    body: table.toString() 
  }
}

export function getPolicy(usercert: string): string | undefined {
  return userPolicies.get(usercert);
}

export function getUserCert(
  request: ccfapp.Request<any>
) : ccfapp.Response<string> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  return {
    body: callerId
  }
}

interface ReqRegisterUserPolicy {
  cert : string,
  policy: string,
}

/**
 * 
 * @param request The incoming request of a user certificate and the policy
 */
export function setUserPolicy(
  request: ccfapp.Request<ReqRegisterUserPolicy>
) : ccfapp.Response {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  const actionPermitted = acl.authz.actionAllowed(callerId, "/policy/write");
  if (!actionPermitted) { return errorResponse(403, `${callerId} is not authorized to register user.`); }

  const body = request.body.json();

  // Note: cannot make user or processor 'users' as this requires write access to TPAL users
  //// Register user with roles
  //let userRolesMapHandle = ccf.kv[userRolesMapTable];
  //userRolesMapHandle.set(ccf.strToBuf(body.cert), ccf.strToBuf("[InsuranceUser]"))
  
  // Add policy
  userPolicies.set(body.cert, body.policy)

  return {
    statusCode: 200
  }
}

export function getUserPolicy(request: ccfapp.Request<any>) : ccfapp.Response<string | ErrorResponse> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  if (!userPolicies.has(callerId)) { return errorResponse(400, "No policy found"); }
  return {
    statusCode: 200,
    body : userPolicies.get(callerId)
  };
}

export function isValidProcessor(processor_cert: string) : boolean {
  return validProcessors.has(processor_cert);
}

var processorAttestation = ccfapp.typedKv("processorAttestation", ccfapp.string, ccfapp.string);

export function setProcessorAttestation(
  request: ccfapp.Request<string>,
) : ccfapp.Response<string | ErrorResponse> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  const actionPermitted = acl.authz.actionAllowed(callerId, "/processor/write");
  if (!actionPermitted) { return errorResponse(403, `${callerId} is not authorized to register processor.`); }

  if (processorAttestation.get('primary') !== request.body.text()) {
    validProcessors.clear()
  }

  processorAttestation.set('primary', request.body.text());

  return {
    statusCode: 200
  }
}

function validateAttestation(query: string, record: string) : boolean {
  // TODO: actually verify each attestation
  return query === record;
}

export function addProcessor(
  request: ccfapp.Request<string>
) : ccfapp.Response<string | ErrorResponse> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();

  if (!validateAttestation(request.body.text(), processorAttestation.get("primary"))) {
    return errorResponse(400, `Invalid attestation: ${request.body.text()} != ${processorAttestation}`);
  }

  validProcessors.set(callerId, true);
  return { statusCode: 200 };
}

export function verifyProcessor(processor_cert: string) : boolean{
  return validProcessors.has(processor_cert);
}
