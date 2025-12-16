# Basic TypeScript App Sample

A simple TypeScript application for Azure Confidential Ledger demonstrating user-defined endpoints with JWT authentication.

## Overview

This sample implements a basic echo endpoint that receives a string value and returns it, showcasing how to build and deploy custom applications to Azure Confidential Ledger.

## Prerequisites

- Node.js v22+ and npm
- Azure CLI (logged in with `az login`)
- Python 3.x
- An existing Azure Confidential Ledger instance with AAD-based authentication

## Quick Start

### 1. Deploy the Application

```bash
python build_and_deploy.py
```

This script will:
- Install npm dependencies
- Build the TypeScript application using Rollup
- Deploy the bundle to your Azure Confidential Ledger
- Save configuration for testing

You'll be prompted for:
- Azure subscription confirmation
- Ledger name (must already exist)
- Resource group name

### 2. Test Interactively

```bash
python test_interactive.py
```

This opens an interactive session where you can:
- Send test values to the echo endpoint
- See responses in real-time
- Type `quit` to exit

## Application Structure

- **src/endpoints/app.ts** - Echo endpoint handler
- **app.json** - Endpoint configuration with JWT authentication
- **build_and_deploy.py** - Build and deployment script
- **test_interactive.py** - Interactive testing script

## Authentication

This sample uses Azure AD token authentication (JWT). Tokens are automatically obtained using `az account get-access-token`.

## API Endpoint

**POST** `/app/echo`

Request body:
```json
{
  "value": "your string here"
}
```

Response:
```json
{
  "echoed_value": "your string here"
}
```
