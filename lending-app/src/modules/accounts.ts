import * as ccfapp from "@microsoft/ccf-app";

export interface Account {
  balance: number;
  collateral: number;
  debt: number;
  wallet: number;
}

export const accountTable = ccfapp.typedKv(
  "accounts",
  ccfapp.string,
  ccfapp.json<Account>(),
);

export function getOrCreateAccount(userId: string): Account {
  if (!accountTable.has(userId)) {
    const account: Account = { balance: 0, collateral: 0, debt: 0, wallet: 0 };
    accountTable.set(userId, account);
    return account;
  }
  return accountTable.get(userId) as Account;
}