import * as ccfapp from "@microsoft/ccf-app";
import { addLiquidity, removeLiquidity } from "../modules/liquidityPools";
import { handleError } from "../utils/errorHandler";

/**
 * Handles depositing tokens into the lending protocol as collateral.
 *
 * This endpoint allows users to deposit tokens into the lending protocol
 * to be used as collateral for borrowing other tokens. The collateral
 * increases the user's borrowing capacity and is deducted from their wallet.
 *
 * Liquidity Pools:
 * - Supported pools for collateral are `BTC` and `ETH`.
 *
 * Input:
 * - `userId` (string): The unique identifier for the user making the deposit.
 * - `symbol` (string): The token symbol to deposit as collateral (e.g., "BTC", "ETH").
 * - `amount` (number): The amount of the token to deposit.
 *
 * Output:
 * - Success: Returns a success message confirming the collateral addition.
 * - Failure: Returns an error message with the appropriate HTTP status code.
 *
 * Workflow:
 * 1. Validate the input parameters (`userId`, `symbol`, `amount`).
 * 2. Deduct the specified token amount from the user's wallet.
 * 3. Add the deducted tokens to the user's collateral balance.
 * 4. Update the account and collateral records in the protocol.
 *
 * Example Request:
 * ```json
 * {
 *   "userId": "user1",
 *   "symbol": "BTC",
 *   "amount": 2
 * }
 * ```
 *
 * Example Response (Success):
 * ```json
 * {
 *   "statusCode": 200,
 *   "body": "Added 2 of token BTC as collateral for user1."
 * }
 * ```
 *
 * Example Response (Error: Invalid Input):
 * ```json
 * {
 *   "statusCode": 400,
 *   "body": "Invalid input parameters"
 * }
 * ```
 */
export function addLiquidityEndpoint(request: ccfapp.Request): ccfapp.Response {
    let body;
    try {
        body = request.body.json();
    } catch {
        return { statusCode: 400, body: "Invalid request body" };
    }

    const { userId, symbol, amount } = body;

    if (!userId || !symbol || amount <= 0) {
        return { statusCode: 400, body: "Invalid input parameters" };
    }

    try {
        const result = addLiquidity(userId, symbol, amount);
        return { statusCode: 200, body: result };
    } catch (error) {
        return handleError(error);
    }
}


/**
 * Handles the removal of liquidity from the protocol's liquidity pools.
 *
 * This endpoint allows users to withdraw their previously supplied liquidity
 * from the protocol. The tokens are deducted from the pool's total liquidity
 * and returned to the user's wallet. Liquidity providers may also forfeit any
 * accrued interest when withdrawing their contribution.
 *
 * Liquidity Pools:
 * - Supported pools for liquidity are `BTC` and `ETH`.
 *
 * Input:
 * - `userId` (string): The unique identifier of the user requesting the withdrawal.
 * - `symbol` (string): The token symbol of the pool to withdraw liquidity from (e.g., "BTC", "ETH").
 * - `amount` (number): The amount of tokens to withdraw from the liquidity pool.
 *
 * Output:
 * - Success: Returns a success message confirming the withdrawal.
 * - Failure: Returns an error message with the appropriate HTTP status code.
 *
 * Workflow:
 * 1. Validate the input parameters (`userId`, `symbol`, `amount`).
 * 2. Retrieve the user's contribution to the specified liquidity pool.
 * 3. Verify that the user has sufficient liquidity in the pool to fulfill the withdrawal request.
 * 4. Deduct the requested amount from the pool's total liquidity.
 * 5. Credit the withdrawn tokens to the user's wallet.
 * 6. Update the pool and user records in the protocol.
 * 7. Return a success message confirming the withdrawal.
 *
 * Example Request:
 * ```json
 * {
 *   "userId": "user1",
 *   "symbol": "BTC",
 *   "amount": 1.5
 * }
 * ```
 *
 * Example Response (Success):
 * ```json
 * {
 *   "statusCode": 200,
 *   "body": "Removed 1.5 of token BTC from the liquidity pool for user1."
 * }
 * ```
 *
 * Example Response (Error: Insufficient Liquidity):
 * ```json
 * {
 *   "statusCode": 400,
 *   "body": "Insufficient liquidity in the user's contribution to the BTC pool."
 * }
 * ```
 *
 * Example Response (Error: Invalid Input):
 * ```json
 * {
 *   "statusCode": 400,
 *   "body": "Invalid input parameters"
 * }
 * ```
 *
 * Notes:
 * - The protocol ensures that the user's withdrawal request does not exceed their contribution to the specified pool.
 * - Withdrawing liquidity may impact the interest earnings of the user, as interest is proportional to the remaining contribution.
 * - This operation reduces the total liquidity available in the specified pool, affecting other borrowers and liquidity providers.
 */
export function removeLiquidityEndpoint(request: ccfapp.Request): ccfapp.Response {
    let body;
    try {
        body = request.body.json();
    } catch {
        return { statusCode: 400, body: "Invalid request body" };
    }

    const { userId, symbol, amount } = body;

    if (!userId || !symbol || amount <= 0) {
        return { statusCode: 400, body: "Invalid input parameters" };
    }

    try {
        const result = removeLiquidity(userId, symbol, amount);
        return { statusCode: 200, body: result };
    } catch (error) {
        return handleError(error);
    }
}
