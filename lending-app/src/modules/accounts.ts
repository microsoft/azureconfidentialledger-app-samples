import * as ccfapp from "@microsoft/ccf-app";

export interface Account {
  balances: Record<string, number>; // Token balances keyed by token address
  collateral: Record<string, number>;              // Total collateral locked
  debt: number;                    // Total debt
}

export const accountTable = ccfapp.typedKv(
  "accounts",
  ccfapp.string,
  ccfapp.json<Account>(),
);

export function getOrCreateAccount(userId: string): Account {
  if (!accountTable.has(userId)) {
    const newAccount: Account = {
      balances: {},  // Initialize empty balances
      collateral: {},
      debt: 0,
    };
    accountTable.set(userId, newAccount);
    return newAccount;
  }

  return accountTable.get(userId) as Account;
}
