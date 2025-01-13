import * as ccfapp from "@microsoft/ccf-app";
import { withdrawInterest } from "../modules/wallet";
import { getOrCreateAccount } from "../modules/accounts";
import { handleError } from "../utils/errorHandler";

export function withdrawInterestEndpoint(
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
        const result = withdrawInterest(userId, amount);
        return { statusCode: 200, body: result };
    } catch (error) {
        return handleError(error);
    }
}

export function getWalletBalanceEndpoint(
    request: ccfapp.Request,
): ccfapp.Response {
    const userId = request.params.user_id;

    if (!userId) {
        return { statusCode: 400, body: "User ID is required" };
    }

    const account = getOrCreateAccount(userId);

    return {
        statusCode: 200,
        body: { walletBalance: account.wallet },
    };
}