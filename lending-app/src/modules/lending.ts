import { accountTable, getOrCreateAccount } from "./accounts";
import { logTransaction } from "./transactions";
import { depositToken } from "./wallet";
import { poolTable } from "./liquidityPools";

const COLLATERAL_FACTOR = 1.5;

export function addCollateral(userId: string, symbol: string, amount: number): string {
  const account = getOrCreateAccount(userId);

  if ((account.balances[symbol] || 0) < amount) {
    throw new Error("Insufficient token balance.");
  }

  account.balances[symbol] -= amount;
  account.collateral[symbol] = (account.collateral[symbol] || 0) + amount;
  accountTable.set(userId, account);

  logTransaction("addCollateral", userId, amount);

  return `Added ${amount} of token ${symbol} as collateral for ${userId}.`;
}

export function borrow(userId: string, borrowAmount: number, baseTokenSymbol: string): string {
  const account = getOrCreateAccount(userId);

  // Calculate total collateral value with collateral factor applied
  const totalCollateral = Object.values(account.collateral).reduce((sum, amount) => sum + amount, 0);
  const maxBorrowable = totalCollateral / COLLATERAL_FACTOR;

  if (borrowAmount > maxBorrowable) {
    throw new Error("Insufficient collateral to borrow this amount.");
  }

  // Deduct the borrowed amount from the protocol's total supply
  // Step 2: Access the liquidity pool and check total supply
  const pool = poolTable.get("defaultPool");
  if (!pool || (pool.totalLiquidity[baseTokenSymbol] || 0) < borrowAmount) {
    throw new Error(`Insufficient liquidity in the pool for token ${baseTokenSymbol}.`);
  }

  // Step 3: Withdraw the borrowed amount from the liquidity pool
  pool.totalLiquidity[baseTokenSymbol] -= borrowAmount;
  poolTable.set("defaultPool", pool);

  // Credit the borrowed amount to the user's wallet
  depositToken(userId, baseTokenSymbol, borrowAmount);

  // Increase the user's debt
  account.debt += borrowAmount;

  // Update the user's account in the account table
  accountTable.set(userId, account);

  // Log the borrowing transaction
  logTransaction("borrow", userId, borrowAmount);

  return `Borrowed ${borrowAmount} of token ${baseTokenSymbol} against collateral.`;
}

