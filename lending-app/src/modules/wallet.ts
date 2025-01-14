import { Account, getOrCreateAccount } from "./accounts";
import { logTransaction } from "./transactions";

export function depositToken(userId: string, token: string, amount: number): string {
  const account = getOrCreateAccount(userId);

  const balance = getTokenBalance(account, token);
  updateTokenBalance(account, token, balance + amount);

  logTransaction("depositToken", userId, amount);

  return `Deposited ${amount} of token ${token} to ${userId}'s wallet.`;
}


export function withdrawToken(userId: string, token: string, amount: number): string {
  const account = getOrCreateAccount(userId);

  const balance = getTokenBalance(account, token);

  if (balance < amount) {
    throw new Error(`Insufficient balance for token ${token}`);
  }

  // Deduct the amount and update the balance
  updateTokenBalance(account, token, balance - amount);

  // Log the transaction
  logTransaction("withdrawToken", userId, amount);

  return `Withdrawn ${amount} of token ${token} from ${userId}'s wallet.`;
}

function getTokenBalance(account: Account, token: string): number {
  return account.balances[token] || 0;
}

function updateTokenBalance(account: Account, token: string, amount: number): void {
  if (amount === 0) {
    delete account.balances[token];
  } else {
    account.balances[token] = amount;
  }
}
