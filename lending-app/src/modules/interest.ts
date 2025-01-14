import { accountTable, getOrCreateAccount } from "./accounts";
import { poolTable } from "./liquidityPools";
import { logTransaction } from "./transactions";

const BASE_RATE = 0.02;

export function accrueInterest(): void {
  const pool = poolTable.get("defaultPool");
  if (!pool) {
    console.error("Liquidity pool does not exist.");
    return;
  }

  // Iterate over all tokens in the pool
  for (const token in pool.totalLiquidity) {
    const totalLiquidity = pool.totalLiquidity[token];

    if (totalLiquidity > 0) {
      // Calculate total interest for the pool
      const totalInterest = totalLiquidity * BASE_RATE;

      // Distribute interest to all contributors
      for (const userId in pool.contributions[token]) {
        const userContribution = pool.contributions[token][userId];
        const userInterest = (userContribution / totalLiquidity) * totalInterest;

        // Add interest to the user's balance
        const account = getOrCreateAccount(userId);
        account.balances[token] = (account.balances[token] || 0) + userInterest;
        accountTable.set(userId, account);

        logTransaction("accrueInterest", userId, userInterest);

        console.log(`Accrued ${userInterest} of token ${token} to user ${userId}`);
      }

      // Deduct total interest from the protocol's total liquidity
      pool.totalLiquidity[token] -= totalInterest;
    }
  }

  // Update the pool in the table
  poolTable.set("defaultPool", pool);
}
