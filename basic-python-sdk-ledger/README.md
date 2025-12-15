# Azure Confidential Ledger - Interactive Python SDK Scripts

Interactive Python scripts for creating and managing Azure Confidential Ledger instances.

## Scripts Overview

| Script | Purpose | Operations |
|--------|---------|------------|
| `create_ledger.py` | Create new ledger | Management plane (Azure Resource Manager) |
| `interact_ledger.py` | Work with existing ledger | Data plane (read/write entries, user management) |

## Quick Start

### 1. Prerequisites
- Python 3.7 or higher
- Azure subscription with Confidential Ledger permissions
- Azure CLI installed

### 2. Setup
```bash
# Create virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1   # Windows PowerShell
# source venv/bin/activate     # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Authenticate
az login
```

### 3. Create a Ledger
```bash
python create_ledger.py
```

### 4. Interact with the Ledger
```bash
python interact_ledger.py
```

## Creating a Ledger

Run `python create_ledger.py` and provide:
- **Subscription ID**: Get via `az account show --query id -o tsv`
- **Resource Group**: Existing resource group name (alphanumeric)
- **Ledger Name**: 3-24 characters, alphanumeric and hyphens (globally unique)
- **Location**: Azure region (e.g., eastus, westus2)
- **Ledger Type**: Public or Private
- **Administrator** (optional): AAD Object ID (`az ad signed-in-user show --query id -o tsv`)

The script displays the **Ledger URI** upon completion - save this for data operations.

## Interacting with a Ledger

Run `python interact_ledger.py` and enter your Ledger URL. The interactive menu provides:

**Data Operations:**
- Write entries (text or JSON) with optional tags → Returns transaction ID
- Read entries (latest or by transaction ID)
- List entries with pagination and optional tag filtering

**Transaction Operations:**
- Get transaction receipts (cryptographic proof)
- Check transaction status (Committed/Pending)

**Management:**
- List collections
- Manage users (Administrator, Contributor, Reader roles)
- View ledger info (consortium, enclave quotes, constitution)

## Key Concepts

### Collections
Logical groupings of entries (default: "default"). Each entry belongs to one collection.

### Tags
Comma-separated labels for grouping related entries (e.g., "alice,greeting"). Use tags to filter entries when listing.

### Transaction IDs
Format: `{blockNumber}.{transactionNumber}` (e.g., `2.15`)
Used to retrieve entries, get receipts, and check status.

### User Roles
- **Administrator**: Full access including user management
- **Contributor**: Read/write entries
- **Reader**: Read-only access

## Common Operations

**Write Entry:**
Tags: payment,alice
→ Transaction ID: 2.15
```

**List Entries by Tag:**
```
Collection ID: default
Filter by tag: alice
→ Shows only entries tagged with "alice"
Collection ID: default
Entry content: {"transaction": "payment", "amount": 100}
→ Transaction ID: 2.15
```

**Read Latest Entry:**
```
Select "Read entry" → "Current (latest) entry"
Collection ID: default
```

**Check Status:**
```
Transaction ID: 2.15
→ State: Committed
```

## Troubleshooting

### Authentication Issues
- Run `az login` and try again
- Verify your account has permissions: `az role assignment list --assignee <your-email>`
- Check subscription: `az account show`

### Resource Group Not Found
- Verify the resource group exists: `az group show --name <resource-group-name>`
- Create if needed: `az group create --name <resource-group-name> --location <location>`

### Insufficient Permissions
- Ensure you have the "Contributor" role or higher on the subscription/resource group
- Request access from your Azure administrator

### Ledger Name Already Exists
- Ledger names must be globally unique across Azure
- Try a different name

## Resources

- [Azure Confidential Ledger Documentation](https://learn.microsoft.com/azure/confidential-ledger/)
- [Python SDK Reference](https://learn.microsoft.com/python/api/overview/azure/confidential-ledger)
- [Azure Identity Documentation](https://learn.microsoft.com/python/api/overview/azure/identity-readme)

## License

See the parent repository for license information.
| Issue | Solution |
|-------|----------|
| Authentication failed | Run `az login` or set environment variables (AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET) |
| Permission denied | Verify Contributor role: `az role assignment list --assignee <email>` |
| Resource group not found | Create: `az group create --name <name> --location <location>` |
| Ledger name exists | Use different name (globally unique required) |
| Script hangs | Ledger creation takes 2-10 minutes - don't interrupt |
| Certificate errors | Scripts auto-download certificates; check network/firewall |
| User management fails | Ensure Administrator role and correct AAD object IDs |

## Tips

- Save transaction IDs for important entries
- Use JSON for structured, queryable data
- Organize entries with named collections
- Add test users before production deployment
- Check transaction status before confirming writes complete

## Resources

- [Azure Confidential Ledger Documentation](https://learn.microsoft.com/azure/confidential-ledger/)
- [Python SDK Reference](https://learn.microsoft.com/python/api/overview/azure/confidential-ledger)
- [Azure Identity Documentation](https://learn.microsoft.com/python/api/overview/azure/identity-readme)