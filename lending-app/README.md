# Lending Protocol on CCF Framework

## Overview
This is a decentralized lending protocol built on the Microsoft CCF framework. The protocol enables:
- **Collateralized Lending**: Users can deposit BTC or ETH as collateral and borrow USDT.
- **Liquidity Pool Management**: Users can add or remove liquidity from BTC and ETH pools.
- **Interest Distribution**: Liquidity providers earn DEFI tokens as interest rewards.

---

## Features
- **Collateral Management**:
  - Deposit BTC or ETH as collateral to borrow USDT.
  - Collateral factor applied for safe borrowing limits.
  
- **Liquidity Pools**:
  - BTC and ETH pools for providing liquidity.
  - Interest distributed to liquidity providers in DEFI tokens.

- **Wallet Operations**:
  - Deposit and withdraw tokens.
  - Query wallet balances.

---

## API Endpoints
### Wallet Endpoints
- **Deposit Token**: `/wallet/deposit`
- **Withdraw Token**: `/wallet/withdraw`
- **Get Wallet Balance**: `/wallet/balance`

### Lending Endpoints
- **Add Collateral**: `/lending/collateral/add`
- **Borrow Tokens**: `/lending/borrow`
- **Remove Liquidity**: `/lending/liquidity/remove`

---

## Configuration
- **Collateral Factor**: Default `1.5` (borrow limit = collateral / collateralFactor).
- **Base Interest Rate**: Default `2%` per period.

---

## Example Usage
### Add Collateral
**Request**:
```json
POST /lending/collateral/add
{
  "userId": "user1",
  "symbol": "BTC",
  "amount": 2
}

{
  "statusCode": 200,
  "body": "Added 2 of token BTC as collateral for user1."
}
```
### Borrow Against Collateral
**Request**:
```json
POST /lending/borrow
{
  "userId": "user1",
  "borrowAmount": 1000,
  "baseTokenSymbol": "USDT"
}

{
  "statusCode": 200,
  "body": "Borrowed 1000 of token USDT against collateral."
}

```