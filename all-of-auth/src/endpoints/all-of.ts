import * as ccfapp from "@microsoft/ccf-app";
import { ccf } from "@microsoft/ccf-app/global";

const aclRolesPrefix = "public:confidentialledger.roles.";
const aclRoleDefinitionsTablePrefix = aclRolesPrefix + "user_roles_definitions.";
const userRolesMapTable = aclRolesPrefix + "user_roles_mapping";

// Expected claim values in the token
const expectedIssuer = "https://login.microsoftonline.com/<tid>/v2.0";
const expectedAudience = "<aud>";
const expectedTenantId = "<tid>";

const writeLogAction = "/logs/write";

/**
  * Creates and returns a CCF KV where the logs are stored.
  * Key is the key_op from the uri and the value is the log message.
*/
function getLogsTable(): ccfapp.TypedKvMap<string, string> {
  return ccfapp.typedKv(
    "sensitive_logs",
    ccfapp.string,
    ccfapp.string,
  );
}

/**
  * Certificate fingerprints are stored in the ledger as AE:72:90:E5:DC:39:1A:D8:94:7D:97:84:05:EB:3F:C0:03:16:18:03:A8:31:85:0F:04:CF:6D:C4:C9:89:F5:6F
  * This function will format the input fingerprint to match the stored value.
  @param fingerprint The certificate fingerprint of the caller.
*/
function formatCertFingerprint(fingerprint: string): string {
  try{
    fingerprint = fingerprint.toUpperCase();
    let chars = [...fingerprint];
    let formatted: string = fingerprint.substring(0,2);

    for(let i=2;i<64;i++) {
      if (i%2 == 0) {
        formatted = formatted + ":" + chars[i];
      } else {
        formatted = formatted + chars[i];
      }
    }

    return formatted;
  }
  catch (e) {
    console.error(`Error when formatting cert fingerprint:`, e);
    return "";
  }
}

interface Caller {
  id: string;
}


/**
  * Retrieve the caller id from the request. This function assumes that the endpoints 
  * are protected using all_of[any_cert, jwt].
  * Returns the normalized cert and jwt as string. 
  * Refer to https://microsoft.github.io/CCF/main/build_apps/js_app_bundle.html 
  * for the supported authentication schemes.
  @param request The incoming request. 
*/
function getCallerIdAndJwt(request: ccfapp.Request<any>): [string, string] {
  // Retrieve the caller cert.
  let certFingerprintAsPem: string = "";

  const allOfIdentity = request.caller as unknown as ccfapp.AllOfAuthnIdentity;
  const callerCert = allOfIdentity?.any_cert?.cert;
  if (callerCert) {
    certFingerprintAsPem = formatCertFingerprint(ccf.pemToId(callerCert));
  } else {
      console.error("Cert is required for authentication")
      throw "Cert is required for authentication"
  }

  // Retrieve the jwt
  const callerJwt = allOfIdentity?.jwt as ccfapp.JwtAuthnIdentity;
  const jwt = callerJwt?.jwt?.payload;

  if (jwt === "" || jwt === undefined) {
    console.error("JWT is required for authentication")
    throw "JWT is required for authentication"
  }

  console.log(`The caller cert fingerprint is ${certFingerprintAsPem}`);
  return [certFingerprintAsPem, jwt];
}

/**
  * Check if a user exist in the ledger.
  * Returns a boolean to indicate if the user exists.
  @param userId The caller id from the request.
*/
function isValidUser(callerId: string): boolean {
    // Get a handle to the public:confidentialledger.roles.user_roles_mapping table.
    //
    let userRolesMapHandle = ccf.kv[userRolesMapTable];
    if (!userRolesMapHandle) {
        console.error(`Table: ${userRolesMapTable} does not exist`);
        return false;
    }

    // Check if the user exist
    //
    const quotedCallerId = `"${callerId}"`;
    return userRolesMapHandle.has(ccf.strToBuf(quotedCallerId));
}

/**
 * This method ensures that the token has the right aud, iss and tid claims.
 * @param jwt The JWT in the request.
 * @param expectedIssuer The trusted issuer.
 * @param expectedAudience The audience.
 * @param expectedTenantId The tenant id.
 * @returns A boolean to indicate if the token has the right claims.
 */
function checkJwtClaims(jwt: any, expectedIssuer: string, expectedAudience: string, expectedTenantId: string): boolean {
  if (!jwt || !jwt.iss) {
    return false;
  }

  var jwtAsJson = JSON.parse(JSON.stringify(jwt));
  console.log(`The jwt iss is ${jwtAsJson.iss}`);
  console.log(`The jwt aud is ${jwtAsJson.aud}`);
  console.log(`The jwt tid is ${jwtAsJson.tid}`);
  
  return jwt.iss === expectedIssuer && jwt.aud === expectedAudience && jwt.tid === expectedTenantId;
}

/**
 * Check if the caller is allowed to perform the action.
  * @param callerId The request caller id.
  * @param action A string that identifies the action being performed.
  * @returns A boolean to indicate if the action is allowed.
*/
function isActionAllowed(callerId: string, action: string): boolean {
  const quotedAction = `"${action}"`;
  const quotedCallerId = `"${callerId}"`;
  let isAllowed = false;

  try {
    if (isValidUser(callerId)) {
      // Iterate over the roles assigned to the user.
      // A user can have multiple roles.
      //
      let userRolesMapHandle = ccf.kv[userRolesMapTable];
      let userRolesConcat = ccf.bufToStr(userRolesMapHandle.get(ccf.strToBuf(quotedCallerId)));

      console.log(`Caller ${callerId} has roles ${userRolesConcat}`)

      // The role(s) are stored as [\"writer\",\"reader\"]
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

        console.log(`Is ${quotedAction} allowed for ${callerId}? ${isAllowed}`)
      });
    }
    else {
      console.log(`UserId ${callerId} does not exist.`)
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
  * Write log message.
  * @param request The incoming request
  * @returns A response indicating the result of the operation.
*/
export function writeLogMessage(request: ccfapp.Request): ccfapp.Response {
  const [callerId, jwtToken] = getCallerIdAndJwt(request);
  
  if (!isActionAllowed(callerId, writeLogAction)) {
    console.log(`Caller ${callerId} is not allowed to perform ${writeLogAction}`)
    return {
      statusCode: 400,
    };
  }

  if (!checkJwtClaims(jwtToken, expectedIssuer, expectedAudience, expectedTenantId)) {
    console.log(`Invalid token as one of the claims did not match the expected values.`)
    return {
      statusCode: 400,
    };
  }

  const logsTable = getLogsTable();
  const keyOperation = request.params.key_op.trim();
  
  let body;
  try {
    body = request.body.json();
  } catch {
    return {
      statusCode: 400,
    };
  }

  console.log(`${body.message}`);
  const payload = body.message.trim();
  
  // write the log message.
  logsTable.set(keyOperation, payload);

  console.log(`${keyOperation} is written.`);

  return {
    statusCode: 204,
  };
}