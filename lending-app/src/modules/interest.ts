import { accountTable } from "./accounts";
import { logTransaction } from "./transactions";

const BASE_RATE = 0.02;

export function accrueInterest(): void {
  accountTable.forEach((account, userId) => {
    if (account.balance > 0) {
      const interest = account.balance * BASE_RATE;
      account.wallet += interest;

      // Update the account directly in the table
      accountTable.set(userId, account);

      // Log the transaction
      logTransaction("accrueInterest", userId, interest);
    }
  });
}