import * as ccfapp from "@microsoft/ccf-app";
import { ccf } from "@microsoft/ccf-app/global";
import { ErrorResponse, decodeJWT, errorResponse, getJWTUser} from "./common";

const config_map = ccfapp.rawKv('config')
const POLICY_KEY = "policy";
const PROCESSOR_ATTESTATION_KEY = "attestation"

export function getPolicy() : string | undefined {
  return config_map.get(POLICY_KEY);
}

export function verifyProcessorAttestation(attestation: ArrayBuffer) : boolean{
  // TODO: actually verify attestation matches
  return true;
}

export function setPolicy(
  request: ccfapp.Request<string>,
): ccfapp.Response<any | ErrorResponse> {
  const oid = getJWTUser(request.headers['authorization']);
  if (oid === undefined) { return errorResponse(403, "Unable to parse JWT authorization.");}

  const actionPermitted = acl.authz.actionAllowed(oid, "/policy/write");
  if (!actionPermitted) { return errorResponse(403, "Not authorized to update policy."); }

  config_map.set(POLICY_KEY, request.body);
}

export function setProcessorAttestation(
  request: ccfapp.Request<string>,
): ccfapp.Response<any | ErrorResponse> {
  return {
    statusCode: 400,
    body: {
      error: "TODO",
    },
  };
}
