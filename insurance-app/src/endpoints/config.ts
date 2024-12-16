import * as ccfapp from "@microsoft/ccf-app";
import {ccf} from "@microsoft/ccf-app/global";

interface Policy {
    value: string;
}

interface Processor {
    value: string;
}

export function set_policy(request: ccfapp.Request<Policy>): 
    ccfapp.Response<any|ErrorResponse> {
    }

export function set_processor(request: ccfapp.Request<Processor>): 
    ccfapp.Response<any|ErrorResponse> {
    }