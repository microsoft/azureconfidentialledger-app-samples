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