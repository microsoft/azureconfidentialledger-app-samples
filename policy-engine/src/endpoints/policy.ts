import * as ccfapp from "@microsoft/ccf-app";
import { ccf } from "@microsoft/ccf-app/global";
import * as ccfcrypto from '@microsoft/ccf-app/crypto.js';

import jsonLogic from "json-logic-js";

const aclRolesPrefix = "public:confidentialledger.roles.";
const aclRoleDefinitionsTablePrefix = aclRolesPrefix + "user_roles_definitions.";
const userRolesMapTable = aclRolesPrefix + "user_roles_mapping";

const createAction = "/policy/action/write";
const deleteAction = "/policy/action/delete";
const evaluateAction = "/policy/action/evaluate";
const getAction = "/policy/action/get";

/**
* HELPER FUNCTIONS
*/

interface Policy {
  rule: string;
}

/**
* Creates and returns a CCF KV where the policies are stored.
* The key is the policy name and the value is the policy details.
*/
const policyTableName = "policy";

function getPolicyTable(): ccfapp.TypedKvMap<ArrayBuffer, Policy> {
  return ccfapp.typedKv(
    policyTableName,
    ccfapp.arrayBuffer,
    ccfapp.json<Policy>(),
  );
}

interface Caller {
  id: string;
}

const allowedOperators = new Set([
    "var",
    "==",
    "===",
    "!=",
    "!==",
    ">",
    ">=",
    "<",
    "<=",
    "and",
    "or",
    "!",
    "+",
    "-",
    "*",
    "/",
    "%",
    "if",
    "in",
    "cat",
    "min",
    "max"
]);

function validatePolicy(rule) {
    if (
        rule === null ||
        typeof rule === "string" ||
        typeof rule === "number" ||
        typeof rule === "boolean"
    ) {
        return;
    }

    if (Array.isArray(rule)) {
        for (const item of rule) {
            validatePolicy(item);
        }
        return;
    }

    if (typeof rule !== "object") {
        console.error("Invalid JSON Logic expression");
        throw new Error("Invalid JSON Logic expression");
    }

    const keys = Object.keys(rule);

    // A JSON Logic expression should contain one operator.
    if (keys.length !== 1) {
        console.error(`Expected exactly one operator, found ${keys.length}`)
        throw new Error(
            `Expected exactly one operator, found ${keys.length}`
        );
    }

    const operator = keys[0];

    if (!allowedOperators.has(operator)) {
      console.error(`Unsupported operator: ${operator}`);
      throw new Error(`Unsupported operator: ${operator}`);
    }

    validatePolicy(rule[operator]);
}

function parsePolicy(policyText: string): any {
    if (typeof policyText !== "string") {
        console.error("Policy rule must be a string");
        throw new Error("Policy rule must be a string");
    }

   let policy;

    try {
        policy = JSON.parse(policyText);
    } catch (error) {
        console.error(`Invalid JSON: ${error.message}`);
        throw new Error(`Invalid JSON: ${error.message}`);
    }

    try {
        validatePolicy(policy);
    } catch (error) {
        console.error(`Invalid policy: ${error.message}`);
        throw new Error(`Invalid policy: ${error.message}`);
    }

    return policy;
}

function normalizePolicyName(policyName: string): string {
  return policyName.trim().toLocaleLowerCase();
}

function normalizePolicyVersion(policyVersion: string): string {
  return policyVersion.trim().toLocaleLowerCase();
}

function digest(input: string) : ArrayBuffer {
    return ccfcrypto.digest("SHA-256", ccf.strToBuf(input));
}

function getPolicyKey(policyName: string, policyVersion: string): ArrayBuffer {
  return digest(`${normalizePolicyName(policyName)}:${normalizePolicyVersion(policyVersion)}`);
}

/**
* Retrieve the caller id from the request. This function assumes that the endpoints 
* are protected using JWT auth.
* Returns the caller id represented as a string. 
* Refer to https://microsoft.github.io/CCF/main/build_apps/js_app_bundle.html 
* for the supported authentication schemes.
* Params:
  * request: The incoming request. 
*/
function getCallerId(request: ccfapp.Request<any>): string {
  // Try to retrieve the caller cert.
  let callerId: string = "";

  // Try to retrieve the jwt.
  const jwtIdentity = request.caller as unknown as ccfapp.JwtAuthnIdentity;
  callerId = jwtIdentity?.jwt?.payload?.oid;
   
  if (callerId === "" || callerId === undefined) {
    console.error("JWT is required")
    throw "JWT is required"
  }

  console.log(`The caller id is ${callerId}`)
  return callerId;
}

/**
* Check if a user exist in the ledger.
* Returns a boolean to indicate if the user exists.
* Params:
  * userId: The caller id from the request.
*/
function isValidUser(userId: string): boolean {
    // Get a handle to the public:confidentialledger.roles.user_roles_mapping table.
    //
    let userRolesMapHandle = ccf.kv[userRolesMapTable];
    if (!userRolesMapHandle) {
        console.error(`Table: ${userRolesMapTable} does not exist`);
        return false;
    }

    // Check if the user exist
    //
    const quotedUserId = `"${userId}"`;
    return userRolesMapHandle.has(ccf.strToBuf(quotedUserId));
}

/**
 * Check if the user is allowed to perform the action. 
 * Returns a boolean to indicate if the action is allowed.
 * Params:
  * userId: The request caller id.
  * action: A string that identifies the action being performed.
*/
function isActionAllowed(userId: string, action: string): boolean {
  const quotedAction = `"${action}"`;
  const quotedUserId = `"${userId}"`;
  let isAllowed = false;

  try {
    if (isValidUser(userId)) {
      // Iterate over the roles assigned to the user.
      // A user can have multiple roles.
      //
      let userRolesMapHandle = ccf.kv[userRolesMapTable];
      let userRolesConcat = ccf.bufToStr(userRolesMapHandle.get(ccf.strToBuf(quotedUserId)));

      console.log(`User ${userId} has roles ${userRolesConcat}`)

      // The role(s) are stored as [\"manager\",\"security_admins\"]
      // Remove the enclosing brackets to get the roles.
      let userRoles = userRolesConcat.replace("[","").replace("]","").replaceAll("\"","").split(",");

      userRoles.forEach((role) => {
        // Create the kv for the specific role
        // Ex: For the manager role, the KVMap name is public:confidentialledger.roles.user_roles_definitions.manager
        // 
        let roleMapName = aclRoleDefinitionsTablePrefix + role;
        let handle = ccf.kv[roleMapName];
        if (!handle) {
            console.error(`Table: ${roleMapName} does not exist`);
            return false;
        }

        // Check if the action is allowed for this role.
        // 
        console.log(`Checking if the action ${quotedAction} is allowed in ${roleMapName}`)

        // A role can have multiple allowed actions.
        // 
        handle.forEach((_, key) => {
          let action = ccf.bufToStr(key);
          console.log(`Allowed action in ${roleMapName} is ${action}`)
          if (quotedAction === action){
            isAllowed = true;
            return;
          }
        });

        console.log(`Is ${quotedAction} allowed for ${userId}? ${isAllowed}`)
      });
    }
    else {
      console.log(`UserId ${userId} does not exist.`)
      return false;
    }

    return isAllowed;
  }
  catch (e) {
    console.error(`Error when checking role:`, e);
    return false;
  }
}

/**
* ENDPOINT HANDLER FUNCTIONS.
*/

/**
* Handle policy creation.
* Params:
  * request: The incoming request.
*/

interface createPolicyRequest {
  rule: string;
}

export function upsertPolicy(request: ccfapp.Request<createPolicyRequest>): ccfapp.Response {
  console.log(`Received request to upsert policy ${request.params.policy_name}:${request.params.policy_version}.`);
  
  const userId = getCallerId(request);
  if (!isActionAllowed(userId, createAction)) {
    console.log(`Invalid action ${createAction} for the user ${userId}.`)
    return {
      statusCode: 400,
    };
  }

  const policyTableHandle = getPolicyTable();
  
  // Generate a unique key for the policy using its name and version.
  const key = getPolicyKey(request.params.policy_name, request.params.policy_version);
  
  if (policyTableHandle.has(key)) {
    console.log(`Policy ${request.params.policy_name}:${request.params.policy_version} already exists. Updating it.`);
  }

  try {
    const rule = JSON.stringify(request.body.json().rule);
    parsePolicy(rule);
    const policy: Policy = { rule };

    console.log(`Parsed policy: ${JSON.stringify(policy)}`);

    policyTableHandle.set(key, policy);
  } catch (error) {
      console.error(`Invalid policy: ${error.message}`);

      return {
        statusCode: 400,
        body: `Invalid policy: ${error.message}`
      };
  }
  
  console.log(`Policy ${request.params.policy_name}:${request.params.policy_version} created.`);

  return {
    statusCode: 204,
  };
}

interface evaluatePolicyRequest {
  input: string;
}

/**
* Evaluate input against the policy.
* Params:
  * request: The incoming request.
*/
export function evaluatePolicy(
  request: ccfapp.Request<evaluatePolicyRequest>,
): ccfapp.Response {
  console.log(`Received request to evaluate policy ${request.params.policy_name}:${request.params.policy_version}.`);
  const userId = getCallerId(request);

  if (!isActionAllowed(userId, evaluateAction)) {
    console.log(`Invalid action ${evaluateAction} for the user ${userId}.`)
    return {
      statusCode: 400,
    };
  }

  const key = getPolicyKey(request.params.policy_name, request.params.policy_version);

  const policyTableHandle = ccf.kv[policyTableName];

  if (policyTableHandle === undefined) {
    return {
      statusCode: 500,
      body: "Internal error. Policy table is undefined."
    };
  }

  const policyBuffer = policyTableHandle.get(key);

  if (policyBuffer === undefined) {
    return {
      statusCode: 500,
      body: "Internal error. Policy is undefined."
    };
  }

  const policy = ccf.bufToJsonCompatible<Policy>(policyBuffer);

  if (policy === undefined) {
    return {
      statusCode: 500,
      body: "Internal error. Policy is an unknown state."
    };
  }

  const body = request.body.json();
  const result = jsonLogic.apply(parsePolicy(policy.rule), body.input);

  return {
    statusCode: 200,
    body: result,
  };
}

/**
* Get a policy.
* @returns The requested policy.
*/

export function getPolicy(request: ccfapp.Request): ccfapp.Response {
  console.log(`Received request to get policy ${request.params.policy_name}:${request.params.policy_version}.`);

  const userId = getCallerId(request);

  if (!isActionAllowed(userId, getAction)) {
    console.log(`Invalid action ${getAction} for the user ${userId}.`);
    return {
      statusCode: 400,
    };
  }

  const key = getPolicyKey(request.params.policy_name, request.params.policy_version);

  const policyTableHandle = ccf.kv[policyTableName];

  if (policyTableHandle === undefined) {
    return {
      statusCode: 500,
      body: "Internal error. Policy table is undefined."
    };
  }

  const policyBuffer = policyTableHandle.get(key);

  if (policyBuffer === undefined) {
    return {
      statusCode: 404,
      body: "Policy not found."
    };
  }

  const policy = ccf.bufToJsonCompatible<Policy>(policyBuffer);

  return {
    statusCode: 200,
    body: policy.rule,
  };
}
