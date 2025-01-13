import { getOrCreateAccount } from "./accounts";
import { logTransaction } from "./transactions";

const COLLATERAL_FACTOR = 1.5;

export function deposit(userId: string, amount: number): string {
  const account = getOrCreateAccount(userId);
  account.balance += amount;
  logTransaction("deposit", userId, amount);
  return `Deposited ${amount} tokens for user ${userId}`;
}

export function addCollateral(userId: string, amount: number): string {
  const account = getOrCreateAccount(userId);
  account.collateral += amount;
  logTransaction("addCollateral", userId, amount);
  return `Added ${amount} tokens as collateral for user ${userId}`;
}

export function borrow(userId: string, amount: number): string {
  const account = getOrCreateAccount(userId);
  if (account.collateral < amount * COLLATERAL_FACTOR) {
    throw new Error("Insufficient collateral.");
  }
  account.debt += amount;
  logTransaction("borrow", userId, amount);
  return `Borrowed ${amount} tokens for user ${userId}`;
}