import * as ccfapp from "@microsoft/ccf-app";

export const SINGLETON_KEY = new ArrayBuffer(8);
export const MAP_PREFIX = "";

export interface ErrorResponse {
  error: string;
}

export function errorResponse(code: number, msg: string) {
  return {
    statusCode: code,
    body: {
      error: msg,
    },
  };
}

export interface Ok {
  ok: true;
  value: "Everything ok";
}
export interface Error<T> {
  ok: false;
  value: T;
}

export type Result<E> = Ok | Error<E>;
export function result_ok<T>(): Result<T> {
  return { ok: true, value: "Everything ok" };
}
export function result_error<T>(msg: T): Result<T> {
  return {
    ok: false,
    value: msg,
  };
}

export function equal_uint8array(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length != b.length) {
    return false;
  }
  let dv1 = new Uint8Array(a);
  let dv2 = new Uint8Array(b);

  for (var i = 0; i < a.length; i++) {
    if (dv1[i] != dv2[i]) {
      return false;
    }
  }
  return true;
}

export function getCallerCert(
  request: ccfapp.Request<any>,
): ccfapp.Response<string> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  return {
    body: callerId,
  };
}
