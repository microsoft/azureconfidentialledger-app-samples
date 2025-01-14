import * as ccfapp from "@microsoft/ccf-app";
import { depositToken, withdrawToken } from "../modules/wallet";
import { getOrCreateAccount } from "../modules/accounts";
import { handleError } from "../utils/errorHandler";

/**
 * Handles depositing tokens into a user's wallet.
 *
 * This endpoint allows tokens to be added to a user's wallet balance. It is typically
 * used to credit tokens after borrowing, interest accrual, or rewards distribution.
 *
 * Input:
 * - `userId` (string): The unique identifier for the user receiving the tokens.
 * - `token` (string): The token symbol to deposit (e.g., "USDT", "DEFI").
 * - `amount` (number): The amount of tokens to deposit into the wallet.
 *
 * Output:
 * - Success: Returns a success message confirming the deposit.
 * - Failure: Returns an error message with the appropriate HTTP status code.
 *
 * Workflow:
 * 1. Validate the input parameters (`userId`, `token`, `amount`).
 * 2. Add the specified token and amount to the user's wallet balance.
 * 3. Update the user's account in the account table.
 * 4. Return a success message.
 *
 * Example Request:
 * ```json
 * {
 *   "userId": "user1",
 *   "token": "USDT",
 *   "amount": 100
 * }
 * ```
 *
 * Example Response (Success):
 * ```json
 * {
 *   "statusCode": 200,
 *   "body": "Deposited 100 of token USDT into user1's wallet."
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
export function depositTokenEndpoint(request: ccfapp.Request): ccfapp.Response {
  let body;
  try {
    body = request.body.json();
  } catch {
    return { statusCode: 400, body: "Invalid request body" };
  }

  const { userId, token, amount } = body;

  // Validate input parameters
  if (!userId || !token || amount <= 0) {
    return { statusCode: 400, body: "Invalid input parameters" };
  }

  try {
    const result = depositToken(userId, token, amount);
    return { statusCode: 200, body: result };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Handles withdrawing tokens from a user's wallet.
 *
 * This endpoint allows tokens to be deducted from a user's wallet balance. It is typically
 * used when users deposit collateral, repay loans, or transfer tokens.
 *
 * Input:
 * - `userId` (string): The unique identifier for the user.
 * - `token` (string): The token symbol to withdraw (e.g., "USDT", "BTC").
 * - `amount` (number): The amount of tokens to withdraw from the wallet.
 *
 * Output:
 * - Success: Returns a success message confirming the withdrawal.
 * - Failure: Returns an error message with the appropriate HTTP status code.
 *
 * Workflow:
 * 1. Validate the input parameters (`userId`, `token`, `amount`).
 * 2. Deduct the specified token and amount from the user's wallet balance.
 * 3. Update the user's account in the account table.
 * 4. Return a success message.
 *
 * Example Request:
 * ```json
 * {
 *   "userId": "user1",
 *   "token": "USDT",
 *   "amount": 50
 * }
 * ```
 *
 * Example Response (Success):
 * ```json
 * {
 *   "statusCode": 200,
 *   "body": "Withdrew 50 of token USDT from user1's wallet."
 * }
 * ```
 *
 * Example Response (Error: Insufficient Balance):
 * ```json
 * {
 *   "statusCode": 400,
 *   "body": "Insufficient balance in the wallet for token USDT."
 * }
 * ```
 */
export function withdrawTokenEndpoint(request: ccfapp.Request): ccfapp.Response {
  let body;
  try {
    body = request.body.json();
  } catch {
    return { statusCode: 400, body: "Invalid request body" };
  }

  const { userId, token, amount } = body;

  // Validate input parameters
  if (!userId || !token || amount <= 0) {
    return { statusCode: 400, body: "Invalid input parameters" };
  }

  try {
    const result = withdrawToken(userId, token, amount);
    return { statusCode: 200, body: result };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Retrieves the wallet balance for a specific token and user.
 *
 * This endpoint allows users or external systems to query the balance of a specific
 * token in the user's wallet.
 *
 * Input:
 * - `userId` (string): The unique identifier for the user.
 * - `token` (string): The token symbol to query (e.g., "BTC", "ETH").
 *
 * Output:
 * - Success: Returns the wallet balance for the specified token.
 * - Failure: Returns an error message with the appropriate HTTP status code.
 *
 * Workflow:
 * 1. Validate the input parameters (`userId`, `token`).
 * 2. Retrieve the user's account and wallet balance for the specified token.
 * 3. Return the balance.
 *
 * Example Request:
 * ```
 * GET /wallet/balance?user_id=user1&token=BTC
 * ```
 *
 * Example Response (Success):
 * ```json
 * {
 *   "statusCode": 200,
 *   "body": {
 *     "walletBalance": 150
 *   }
 * }
 * ```
 *
 * Example Response (Error: Invalid Input):
 * ```json
 * {
 *   "statusCode": 400,
 *   "body": "User ID is required"
 * }
 * ```
 */
export function getWalletBalanceEndpoint(
  request: ccfapp.Request,
): ccfapp.Response {
  const userId = request.params.user_id;
  const token = request.params.token;

  // Validate input parameters
  if (!userId) {
    return { statusCode: 400, body: "User ID is required" };
  }

  if (!token) {
    return { statusCode: 400, body: "Token is required" };
  }

  // Retrieve the user's account and balance
  const account = getOrCreateAccount(userId);

  return {
    statusCode: 200,
    body: { walletBalance: account.balances[token] || 0 },
  };
}