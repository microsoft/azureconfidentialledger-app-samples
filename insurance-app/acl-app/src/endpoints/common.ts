import * as ccfapp from "@microsoft/ccf-app"

export interface ErrorResponse {
  error: string;
}

export function errorResponse(code: number, msg: string) {
  return {
    statusCode : code,
    body: {
      error : msg,
    }
  }
}

export interface Ok {
  ok: true,
  value: "Everything ok"
}
export interface Error<T> {
  ok: false,
  value: T;
}

export type Result<E> = Ok | Error<E> 
export function result_ok<T>() : Result<T> {
  return {ok:true, value: "Everything ok"};
}
export function result_error<T>(msg : T) : Result<T> {
  return {
    ok: false,
    value: msg,
  }
}