import * as ccfapp from "@microsoft/ccf-app";
import { ccf } from "@microsoft/ccf-app/global";
import { ErrorResponse } from "./common";

interface IncidentDesc {
  fingerprint: string;
}
interface IncidentCase {
  case_id: number;
  policy: string;
}
export function add_incident(
  request: ccfapp.Request<IncidentDesc>,
): ccfapp.Response<IncidentCase | ErrorResponse> {}

interface IncidentDecision {
  incident_fingerprint: string;
  policy_fingerprint: string;
  processor_attestation: string;
  claim_is_approved: boolean;
}
export function put_case_decision(
  request: ccfapp.Request<IncidentDecision>,
): ccfapp.Response<any | ErrorResponse> {
  return {
    statusCode: 400,
    body: {
      error: "TODO",
    },
  };
}
export function get_case_decision(): ccfapp.Response<
  IncidentDecision | ErrorResponse
> {
  return {
    statusCode: 400,
    body: {
      error: "TODO",
    },
  };
}
