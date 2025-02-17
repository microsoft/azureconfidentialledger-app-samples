import * as ccfapp from "@microsoft/ccf-app";
import { ErrorResponse, errorResponse, MAP_PREFIX } from "./common";

const userPolicies = ccfapp.typedKv(
  MAP_PREFIX + "userPolicy",
  ccfapp.string,
  ccfapp.string,
);

export function getPolicy(user_fingerprint: string): string | undefined {
  return userPolicies.get(user_fingerprint);
}

interface ReqRegisterUserPolicy {
  cert: string;
  policy: string;
}

export function getUserPolicy(
  request: ccfapp.Request<any>,
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

export function setUserPolicy(
  request: ccfapp.Request<ReqRegisterUserPolicy>,
): ccfapp.Response {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  const actionPermitted = acl.authz.actionAllowed(callerId, "/policy/write");
  if (!actionPermitted) {
    return errorResponse(
      403,
      `${callerId} is not authorized to set an insurance policy.`,
    );
  }

  try {
    var { cert, policy } = request.body.json();
    if (!cert || typeof cert !== "string") {
      return errorResponse(400, "Missing or invalid user certificate.");
    }
    if (!policy || typeof policy !== "string") {
      return errorResponse(400, "Missing or invalid policy.");
    }
  } catch (error) {
    return errorResponse(400, "Failed while parsing body: " + error.message);
  }

  // Add policy
  userPolicies.set(cert, policy);

  return {
    statusCode: 200,
  };
}
