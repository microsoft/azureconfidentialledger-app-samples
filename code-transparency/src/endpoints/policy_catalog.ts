import { getPolicyCatalog } from "../policies/engine";
import { successResponse, log } from "./common";
import * as ccfapp from "@microsoft/ccf-app";

// GET /policies — List available predefined policies
export function listPolicies(request: ccfapp.Request): ccfapp.Response {
  log("listPolicies", "Returning policy catalog");
  return successResponse({ policies: getPolicyCatalog() });
}
