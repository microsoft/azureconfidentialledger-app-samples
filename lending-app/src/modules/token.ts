
import * as ccfapp from "@microsoft/ccf-app";


export interface Token {
    name: string;
    symbol: string;
    totalSupply: number;
}

export const tokenTable = ccfapp.typedKv(
    "tokens",
    ccfapp.string,         // Key: token symbol
    ccfapp.json<Token>(),  // Value: Token object
);


export function createToken(symbol: string, name: string, totalSupply: number): string {
    if (tokenTable.has(symbol)) {
      throw new Error(`Token with symbol ${symbol} already exists.`);
    }
  
    const token: Token = { name, symbol, totalSupply };
    tokenTable.set(symbol, token);
  
    return `Token ${name} (${symbol}) created with total supply of ${totalSupply}`;
  }
  