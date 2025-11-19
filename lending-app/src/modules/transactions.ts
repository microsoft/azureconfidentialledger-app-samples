import * as ccfapp from "@microsoft/ccf-app";

export interface Transaction {
  action: string;
  user: string;
  amount: number;
  timestamp: string;
}

export const transactionTable = ccfapp.typedKv(
  "transactions",
  ccfapp.string,
  ccfapp.json<Transaction>(),
);

export function logTransaction(action: string, user: string, amount: number) {
  const transactionId = `${Date.now()}-${user}`;
  const transaction: Transaction = {
    action,
    user,
    amount,
    timestamp: new Date().toISOString(),
  };
  transactionTable.set(transactionId, transaction);
}