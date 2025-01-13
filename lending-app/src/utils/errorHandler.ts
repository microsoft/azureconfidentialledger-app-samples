import * as ccfapp from "@microsoft/ccf-app";


export function handleError(error: unknown): ccfapp.Response {
    if (error instanceof Error) {
        return { statusCode: 400, body: error.message };
    } else {
        return { statusCode: 400, body: "An unknown error occurred." };
    }
}