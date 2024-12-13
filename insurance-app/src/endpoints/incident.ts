import * as ccfapp from "@microsoft/ccf-app";
import {ccf} from "@microsoft/ccf-app/global";
import * as common from "./common";

interface IncidentDesc {
    fingerprint: string;
}
interface IncidentCase {
    case_id: number;
    policy: string;
}
export function add_incident(request: ccfapp.Request<IncidentDesc>): 
    ccfapp.Response<IncidentCase|common.ErrorResponse> {
    }

interface IncidentDecision{
    incident_fingerprint: string;
    policy_fingerprint: string;
    processor_attestation: string;
    claim_is_approved: boolean;
}
export function put_case_decision(request: ccfapp.Request<IncidentDecision>):
    ccfapp.Response<any | common.ErrorResponse> {
    }
export function get_case_decision(): ccfapp.Response<IncidentDecision|common.ErrorResponse> {
}