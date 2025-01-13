import * as ccfapp from "@microsoft/ccf-app";
import { borrow, deposit } from "../modules/leding";
import { handleError } from "../utils/errorHandler";

export function depositEndpoint(
    request: ccfapp.Request,
): ccfapp.Response {
    let body;
    try {
        body = request.body.json();
    } catch {
        return { statusCode: 400, body: "Invalid request body" };
    }

    const { userId, amount } = body;

    if (!userId || amount <= 0) {
        return { statusCode: 400, body: "Invalid input parameters" };
    }

    try {
        const result = deposit(userId, amount);
        return { statusCode: 200, body: result };
    } catch (error) {
        return handleError(error);
    }
}

export function borrowEndpoint(
    request: ccfapp.Request,
): ccfapp.Response {
    let body;
    try {
        body = request.body.json();
    } catch {
        return { statusCode: 400, body: "Invalid request body" };
    }

    const { userId, amount } = body;

    if (!userId || amount <= 0) {
        return { statusCode: 400, body: "Invalid input parameters" };
    }

    try {
        const result = borrow(userId, amount);
        return { statusCode: 200, body: result };
    } catch (error) {
        return handleError(error);
    }
}