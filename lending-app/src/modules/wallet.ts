import { getOrCreateAccount } from "./accounts";
import { logTransaction } from "./transactions";

export function withdrawInterest(userId: string, amount: number): string {
  const account = getOrCreateAccount(userId);
  if (account.wallet < amount) {
    throw new Error("Insufficient wallet balance.");
  }
  account.wallet -= amount;
  logTransaction("withdrawInterest", userId, amount);
  return `Withdrawn ${amount} tokens from ${userId}'s wallet.`;
}