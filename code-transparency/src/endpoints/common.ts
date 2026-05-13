export interface ErrorResponse {
  error: string;
}

const LOG_PREFIX = "[CodeTransparency]";

export function log(component: string, message: string, data?: any) {
  const entry = data !== undefined
    ? `${LOG_PREFIX} [${component}] ${message} | ${JSON.stringify(data)}`
    : `${LOG_PREFIX} [${component}] ${message}`;
  console.log(entry);
}

export function logError(component: string, message: string, data?: any) {
  const entry = data !== undefined
    ? `${LOG_PREFIX} [${component}] ERROR: ${message} | ${JSON.stringify(data)}`
    : `${LOG_PREFIX} [${component}] ERROR: ${message}`;
  console.error(entry);
}

export function errorResponse(code: number, msg: string) {
  return {
    statusCode: code,
    body: { error: msg } as ErrorResponse,
  };
}

export function successResponse<T>(body: T, code: number = 200) {
  return {
    statusCode: code,
    body,
  };
}

// Extract caller ID from request (cert fingerprint or JWT oid)
export function getCallerId(request: any): string {
  // Try certificate identity first
  const certIdentity = request.caller;
  if (certIdentity?.cert) {
    // @ts-ignore - ccf global available at runtime
    const id = ccf.pemToId(certIdentity.cert);
    log("auth", "Caller identified via certificate", { callerId: id });
    return id;
  }

  // Try JWT identity
  if (certIdentity?.jwt?.payload?.oid) {
    const id = certIdentity.jwt.payload.oid;
    log("auth", "Caller identified via JWT", { callerId: id });
    return id;
  }

  log("auth", "No caller identity found, using anonymous");
  return "anonymous";
}

// Validate that owner/scope names are safe
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;

export function validateName(name: string, field: string): string | null {
  if (!name || !NAME_PATTERN.test(name)) {
    return `Invalid ${field}: must be 1-63 chars, alphanumeric with ._- allowed, starting with alphanumeric`;
  }
  return null;
}

// Get current Unix timestamp (CCF returns 0 for Date.now() by default)
export function nowUnixSeconds(): number {
  // @ts-ignore - ccf global available at runtime
  const prev = ccf.enableUntrustedDateTime(true);
  const ts = Math.floor(Date.now() / 1000);
  // @ts-ignore
  ccf.enableUntrustedDateTime(prev);
  return ts;
}
