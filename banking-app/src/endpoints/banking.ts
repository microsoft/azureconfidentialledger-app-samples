import * as ccfapp from "@microsoft/ccf-app";
import { ccf } from "@microsoft/ccf-app/global";

const aclRolesPrefix = "public:confidentialledger.roles.";
const aclRoleDefinitionsTablePrefix = aclRolesPrefix + "user_roles_definitions.";
const userRolesMapTable = aclRolesPrefix + "user_roles_mapping";

const createAccountAction = "/banking/accounts/post";
const depositAction = "/banking/accounts/put";
const balanceAction = "/banking/accounts/get";
const transferAction = "/banking/accounts/patch";

/**
* HELPER FUNCTIONS
*/

/**
* Parse the incoming request.
* Params:
  * request: The incoming request.
*/
function parseRequestQuery(request: ccfapp.Request<any>): any {
  const elements = request.query.split("&");
  const obj = {};
  for (const kv of elements) {
    const [k, v] = kv.split("=");
    obj[k] = v;
  }
  return obj;
}

interface ClaimItem {
  userId: string;
  claim: string;
}

const claimTableName = "current_claim";
const currentClaimTable = ccfapp.typedKv(
  claimTableName,
  ccfapp.string,
  ccfapp.json<ClaimItem>(),
);
const keyForClaimTable = "key";

/**
* Creates and returns a CCF KV where the accounts are stored.
* The key is the account name and the value is the balance.
*/
function getAccountTable(): ccfapp.TypedKvMap<string, number> {
  return ccfapp.typedKv(
    "user_accounts",
    ccfapp.string,
    ccfapp.uint32,
  );
}

/**
* Certificate fingerprints are stored in the ledger as AE:72:90:E5:DC:39:1A:D8:94:7D:97:84:05:EB:3F:C0:03:16:18:03:A8:31:85:0F:04:CF:6D:C4:C9:89:F5:6F
* This function will format the input fingerprint to match the stored value.
* Params:
  * fingerprint: The certificate fingerprint of the caller.
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
* are protected either using JWT or any_cert auth.
* Returns the caller id represented as a string. 
* Refer to https://microsoft.github.io/CCF/main/build_apps/js_app_bundle.html 
* for the supported authentication schemes.
* Params:
  * request: The incoming request. 
*/
function getCallerId(request: ccfapp.Request<any>): string {
  // Try to retrieve the caller cert.
  let callerId: string = "";

  const certIdentity = request.caller as unknown as ccfapp.AnyCertAuthnIdentity;
  const callerCert = certIdentity?.cert;
  if (callerCert) {
    callerId = formatCertFingerprint(ccf.pemToId(callerCert));
  } else {
    // Try to retrieve the jwt.
    const jwtIdentity = request.caller as unknown as ccfapp.JwtAuthnIdentity;
    callerId = jwtIdentity?.jwt?.payload?.oid;
  }
  
  if (callerId === "" || callerId === undefined) {
    console.error("Either user cert or JWT is required")
    throw "Either user cert or JWT is required"
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
 * Check if the input is a positive integer value.
 * Returns a boolean.
 * Params:
  * value: The value to be checked.
*/
function isPositiveInteger(value: any): boolean {
  return Number.isInteger(value) && value > 0;
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
* Handle account creation.
* Params:
  * request: The incoming request.
*/
export function createAccount(request: ccfapp.Request): ccfapp.Response {
  const userId = getCallerId(request);
  if (!isActionAllowed(userId, createAccountAction)) {
    console.log(`Invalid action ${createAccountAction} for the user ${userId}.`)
    return {
      statusCode: 400,
    };
  }

  const accountToBalance = getAccountTable();

  const accountName = request.params.account_name.trim();

  if (accountToBalance.has(accountName)) {
    // Nothing to do
    return {
      statusCode: 204,
    };
  }

  // Initial balance should be 0.
  accountToBalance.set(accountName, 0);

  console.log(`Account ${accountName} created.`);

  return {
    statusCode: 204,
  };
}

interface DepositRequest {
  value: number;
}

/**
* Handle deposits.
* Params:
  * request: The incoming request.
*/
export function deposit(
  request: ccfapp.Request<DepositRequest>,
): ccfapp.Response {
  const userId = getCallerId(request);

  if (!isActionAllowed(userId, depositAction)) {
    console.log(`Invalid action ${depositAction} for the user ${userId}.`)
    return {
      statusCode: 400,
    };
  }

  let body;
  try {
    body = request.body.json();
  } catch {
    return {
      statusCode: 400,
    };
  }

  const value = body.value;

  if (!isPositiveInteger(value)) {
    return {
      statusCode: 400,
    };
  }

  const accountName = request.params.account_name;

  const accountToBalance = getAccountTable();

  if (!accountToBalance.has(accountName)) {
    return { statusCode: 404 };
  }

  accountToBalance.set(accountName, accountToBalance.get(accountName) + value);

  console.log(`Deposit ${value} into ${accountName} is completed.`);

  return {
    statusCode: 204,
  };
}

interface BalanceResponse {
  balance: number;
}

/**
* Handle get balance.
* Params:
  * request: The incoming request.
*/
export function balance(
  request: ccfapp.Request,
): ccfapp.Response<BalanceResponse> {
  const userId = getCallerId(request);

  if (!isActionAllowed(userId, balanceAction)) {
    console.log(`Invalid action ${balanceAction} for the user ${userId}.`)
    return {
      statusCode: 400,
    };
  }

  const accountName = request.params.account_name;
  const accountToBalance = getAccountTable();

  if (!accountToBalance.has(accountName)) {
    return { statusCode: 404 };
  }

  return { body: { balance: accountToBalance.get(accountName) } };
}

interface TransferRequest {
  value: number;
  account_name_to: string;
}

type TransferResponse = string;

/**
* Handle account transfer.
* Params:
  * request: The incoming request.
*/
export function transfer(
  request: ccfapp.Request<TransferRequest>,
): ccfapp.Response<TransferResponse> {
  const userId = getCallerId(request);

  if (!isActionAllowed(userId, transferAction)) {
    console.log(`Invalid action ${transferAction} for the user ${userId}.`)
    return {
      statusCode: 400,
    };
  }

  let body;
  try {
    body = request.body.json();
  } catch {
    return {
      statusCode: 400,
    };
  }

  const value = body.value;

  if (!isPositiveInteger(value)) {
    return {
      statusCode: 400,
    };
  }

  const accountNameFrom = request.params.account_name;
  const accountNameTo = body.account_name_to;

  const accountToBalance = getAccountTable();
  if (!accountToBalance.has(accountNameFrom)) {
    return { statusCode: 404 };
  }

  const accountToBalanceTo = getAccountTable();
  if (!accountToBalanceTo.has(accountNameTo)) {
    return { statusCode: 404 };
  }

  const balance = accountToBalance.get(accountNameFrom);

  if (value > balance) {
    return { statusCode: 400, body: "Balance is not enough" };
  }

  accountToBalance.set(accountNameFrom, balance - value);
  accountToBalanceTo.set(
    accountNameTo,
    accountToBalanceTo.get(accountNameTo) + value,
  );

  const claim = `${userId} transferred ${value} from ${accountNameFrom} to ${accountNameTo}`;
  currentClaimTable.set(keyForClaimTable, { userId, claim });
  const claimDigest = ccf.crypto.digest("SHA-256", ccf.strToBuf(claim));
  ccf.rpc.setClaimsDigest(claimDigest);

  console.log("Transfer completed.");

  return {
    statusCode: 204,
  };
}

function validateTransactionId(transactionId: any): boolean {
  // Transaction ID is composed of View ID and Sequence Number
  // https://microsoft.github.io/CCF/main/overview/glossary.html#term-Transaction-ID
  if (typeof transactionId !== "string") {
    return false;
  }
  const strNums = transactionId.split(".");
  if (strNums.length !== 2) {
    return false;
  }

  return (
    isPositiveInteger(parseInt(strNums[0])) &&
    isPositiveInteger(parseInt(strNums[1]))
  );
}

interface LeafComponents {
  claims: string;
  commit_evidence: string;
  write_set_digest: string;
}

interface GetTransactionREceiptResponse {
  cert: string;
  leaf_components: LeafComponents;
  node_id: string;
  proof: ccfapp.Proof;
  signature: string;
}

/**
* Handle get transaction receipt.
* Params:
  * request: The incoming request.
*/
export function getTransactionReceipt(
  request: ccfapp.Request,
): ccfapp.Response<GetTransactionREceiptResponse> | ccfapp.Response {
  const parsedQuery = parseRequestQuery(request);
  const transactionId = parsedQuery.transaction_id;

  if (!validateTransactionId(transactionId)) {
    return {
      statusCode: 400,
    };
  }

  const userId = getCallerId(request);
  const txNums = transactionId.split(".");
  const seqno = parseInt(txNums[1]);

  const rangeBegin = seqno;
  const rangeEnd = seqno;

  // Make hundle based on https://github.com/microsoft/CCF/blob/main/samples/apps/logging/js/src/logging.js
  // Compute a deterministic handle for the range request.
  // Note: Instead of ccf.digest, an equivalent of std::hash should be used.
  const makeHandle = (begin: number, end: number, id: string): number => {
    const cacheKey = `${begin}-${end}-${id}`;
    const digest = ccf.crypto.digest("SHA-256", ccf.strToBuf(cacheKey));
    const handle = new DataView(digest).getUint32(0);
    return handle;
  };
  const handle = makeHandle(rangeBegin, rangeEnd, transactionId);

  // Fetch the requested range
  const expirySeconds = 1800;
  const states = ccf.historical.getStateRange(
    handle,
    rangeBegin,
    rangeEnd,
    expirySeconds,
  );
  if (states === null) {
    return {
      statusCode: 202,
      headers: {
        "retry-after": "1",
      },
      body: `Historical transactions from ${rangeBegin} to ${rangeEnd} are not yet available, fetching now`,
    };
  }

  const firstKv = states[0].kv;
  const claimTable = ccfapp.typedKv(
    firstKv[claimTableName],
    ccfapp.string,
    ccfapp.json<ClaimItem>(),
  );

  if (!claimTable.has(keyForClaimTable)) {
    return {
      statusCode: 404,
    };
  }

  const claimItem = claimTable.get(keyForClaimTable);
  if (claimItem.userId !== userId) {
    // Access to the claim is not allowed
    return {
      statusCode: 404,
    };
  }

  const receipt = states[0].receipt;
  const body = {
    cert: receipt.cert,
    leaf_components: {
      claim: claimItem.claim,
      commit_evidence: receipt.leaf_components.commit_evidence,
      write_set_digest: receipt.leaf_components.write_set_digest,
    },
    node_id: receipt.node_id,
    proof: receipt.proof,
    signature: receipt.signature,
  };

  return {
    body,
  };
}
