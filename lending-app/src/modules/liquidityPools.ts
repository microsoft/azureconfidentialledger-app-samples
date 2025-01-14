import * as ccfapp from "@microsoft/ccf-app";
import { accountTable, getOrCreateAccount } from "./accounts";
import { logTransaction } from "./transactions";

export interface Pool {
    totalLiquidity: Record<string, number>; // Total liquidity for each token
    contributions: Record<string, Record<string, number>>; // User contributions per token
  }
  

export const poolTable = ccfapp.typedKv(
  "liquidityPools",
  ccfapp.string, // Key: pool identifier (e.g., "defaultPool")
  ccfapp.json<Pool>(), // Value: Pool object
);

export function addLiquidity(userId: string, symbol: string, amount: number): string {
  const account = getOrCreateAccount(userId);

  if ((account.balances[symbol] || 0) < amount) {
    throw new Error("Insufficient token balance.");
  }

  // Get or create the pool
  const pool = poolTable.get("defaultPool") || { totalLiquidity: {}, contributions: {} };

  // Update the user's contribution
  pool.contributions[symbol] = pool.contributions[symbol] || {};
  pool.contributions[symbol][userId] = (pool.contributions[symbol][userId] || 0) + amount;

  // Update total liquidity
  pool.totalLiquidity[symbol] = (pool.totalLiquidity[symbol] || 0) + amount;

  // Deduct the tokens from the user's wallet
  account.balances[symbol] -= amount;
  poolTable.set("defaultPool", pool);

  // Update the account in the table
  accountTable.set(userId, account);

  logTransaction("addLiquidity", userId, amount);

  return `Added ${amount} of token ${symbol} to the liquidity pool.`;
}

export function removeLiquidity(userId: string, symbol: string, amount: number): string {
    const account = getOrCreateAccount(userId);
  
    // Get the pool
    const pool = poolTable.get("defaultPool");
    if (!pool || !pool.contributions[symbol] || (pool.contributions[symbol][userId] || 0) < amount) {
      throw new Error("Insufficient liquidity in the pool.");
    }
  
    // Update the user's contribution
    pool.contributions[symbol][userId] -= amount;
  
    // Remove the entry if the contribution is now zero
    if (pool.contributions[symbol][userId] === 0) {
      delete pool.contributions[symbol][userId];
    }
  
    // Update total liquidity
    pool.totalLiquidity[symbol] -= amount;
  
    // Credit the tokens back to the user's wallet
    account.balances[symbol] = (account.balances[symbol] || 0) + amount;
  
    poolTable.set("defaultPool", pool);
    accountTable.set(userId, account);
  
    logTransaction("removeLiquidity", userId, amount);
  
    return `Removed ${amount} of token ${symbol} from the liquidity pool.`;
  }
  