import * as ccfapp from "@microsoft/ccf-app";
import { addCollateral, borrow } from "../modules/lending";
import { handleError } from "../utils/errorHandler";


/**
 * Handles depositing tokens into the lending protocol for collateral.
 *
 * This endpoint allows users to directly add tokens to their collateral,
 * deducting the specified amount from their wallet balance. The collateral
 * is used to increase the user's borrowing capacity.
 *
 * Input:
 * - `userId` (string): The unique identifier for the user making the deposit.
 * - `symbol` (string): The token symbol (e.g., "DEFI").
 * - `amount` (number): The amount of the token to deposit as collateral.
 *
 * Output:
 * - Success: Returns a success message confirming the collateral addition.
 * - Failure: Returns an error message with the appropriate HTTP status code.
 *
 * Workflow:
 * 1. Parse and validate the input parameters (`userId`, `symbol`, `amount`).
 * 2. Check that the user exists and has sufficient balance for the token.
 * 3. Deduct the specified `amount` of `symbol` tokens from the user's wallet.
 * 4. Add the deducted tokens to the user's collateral in the lending protocol.
 * 5. Return a success message confirming the operation.
 *
 * Example Request:
 * ```json
 * {
 *   "userId": "user1",
 *   "symbol": "DEFI",
 *   "amount": 500
 * }
 * ```
 *
 * Example Response (Success):
 * ```json
 * {
 *   "statusCode": 200,
 *   "body": "Added 500 of token DEFI as collateral for user1."
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
 * Example Response (Error: Insufficient Balance):
 * ```json
 * {
 *   "statusCode": 400,
 *   "body": "Insufficient token balance for collateral addition."
 * }
 * ```
 */
export function addCollateralEndpoint(request: ccfapp.Request): ccfapp.Response {
    let body;
    try {
        body = request.body.json();
    } catch {
        return { statusCode: 400, body: "Invalid request body" };
    }

    const { userId, symbol, amount } = body;

    // Validate input parameters
    if (!userId || !symbol || amount <= 0) {
        return { statusCode: 400, body: "Invalid input parameters" };
    }

    try {
        // Add tokens directly to collateral
        const collateralResult = addCollateral(userId, symbol, amount);

        return { statusCode: 200, body: collateralResult };
    } catch (error) {
        return handleError(error);
    }
}

/**
 * Handles borrowing tokens against collateral in the lending protocol.
 *
 * This endpoint validates the user's collateral and borrowing capacity
 * before crediting the borrowed tokens to their wallet. The borrow
 * operation deducts the borrowed amount from the protocol's liquidity
 * pool and increases the user's debt balance.
 *
 * Input:
 * - `userId` (string): The unique identifier of the user making the request.
 * - `borrowAmount` (number): The amount of the token to borrow.
 * - `baseTokenSymbol` (string): The symbol of the token to borrow (e.g., "BTC").
 *
 * Output:
 * - Success: Returns a success message confirming the borrowed amount.
 * - Failure: Returns an error message with the appropriate HTTP status code.
 *
 * Workflow:
 * 1. Validates input parameters (`userId`, `borrowAmount`, `baseTokenSymbol`).
 * 2. Calls the `borrow` method in the lending module to:
 *    - Verify collateral sufficiency.
 *    - Deduct the borrowed tokens from the liquidity pool.
 *    - Increase the user's debt.
 *    - Credit the borrowed tokens to the user's wallet.
 * 3. Returns a response with the result of the borrowing operation.
 *
 *
 * Example Request:
 * ```json
 * {
 *   "userId": "user1",
 *   "borrowAmount": 150,
 *   "baseTokenSymbol": "BTC"
 * }
 * ```
 *
 * Example Response:
 * ```json
 * {
 *   "statusCode": 200,
 *   "body": "Borrowed 150 of token BTC against collateral."
 * }
 * ```
 */
export function borrowEndpoint(request: ccfapp.Request): ccfapp.Response {
    let body;
    try {
        body = request.body.json();
    } catch {
        return { statusCode: 400, body: "Invalid request body" };
    }

    const { userId, borrowAmount, baseTokenSymbol } = body;

    // Validate input parameters
    if (!userId || !baseTokenSymbol || borrowAmount <= 0) {
        return { statusCode: 400, body: "Invalid input parameters" };
    }

    try {
        // Attempt to borrow tokens using the lending logic
        const result = borrow(userId, borrowAmount, baseTokenSymbol);

        return { statusCode: 200, body: result };
    } catch (error) {
        return handleError(error);
    }
}
