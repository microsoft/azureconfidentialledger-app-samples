#!/usr/bin/env python3
"""
Interactive script to interact with an Azure Confidential Ledger using the Python SDK.

This script provides a simple interactive experience for performing data plane
operations on an existing Confidential Ledger instance.

Prerequisites:
- Install dependencies: pip install -r requirements.txt
- Azure CLI authentication or appropriate credentials configured
- Existing Confidential Ledger instance with appropriate permissions
"""

import sys
import json
from typing import Optional
from datetime import datetime
from azure.identity import DefaultAzureCredential, AzureCliCredential
from azure.confidentialledger import ConfidentialLedgerClient
from azure.confidentialledger.certificate import ConfidentialLedgerCertificateClient
from azure.core.exceptions import HttpResponseError, ResourceNotFoundError


def print_banner():
    """Print a welcome banner."""
    print("=" * 70)
    print("  Azure Confidential Ledger - Interactive Operations")
    print("=" * 70)
    print()


def get_input(prompt: str, default: Optional[str] = None) -> str:
    """
    Get user input with optional default value.
    
    Args:
        prompt: The prompt to display
        default: Default value if user just presses Enter
        
    Returns:
        User input or default value
    """
    if default:
        full_prompt = f"{prompt} [{default}]: "
    else:
        full_prompt = f"{prompt}: "
    
    value = input(full_prompt).strip()
    return value if value else (default or "")


def get_choice(prompt: str, options: list, default: Optional[str] = None) -> str:
    """
    Get user choice from a list of options.
    
    Args:
        prompt: The prompt to display
        options: List of valid options
        default: Default option if user just presses Enter
        
    Returns:
        Selected option
    """
    print(f"\n{prompt}")
    for i, option in enumerate(options, 1):
        marker = " (default)" if option == default else ""
        print(f"  {i}. {option}{marker}")
    
    while True:
        choice = input(f"\nEnter choice (1-{len(options)}): ").strip()
        
        if not choice and default:
            return default
        
        try:
            index = int(choice) - 1
            if 0 <= index < len(options):
                return options[index]
            else:
                print(f"Please enter a number between 1 and {len(options)}")
        except ValueError:
            print("Please enter a valid number")


def create_ledger_client(ledger_url: str) -> ConfidentialLedgerClient:
    """
    Create a Confidential Ledger client.
    
    Args:
        ledger_url: The URL of the ledger
        
    Returns:
        ConfidentialLedgerClient instance
    """
    print("\n[1/2] Authenticating with Azure...")
    try:
        credential = DefaultAzureCredential()
        # Test the credential
        token = credential.get_token("https://confidential-ledger.azure.com/.default")
        print("  ✓ Authentication successful")
    except Exception as e:
        print(f"  ✗ Default authentication failed: {e}")
        print("\n  Trying Azure CLI authentication...")
        credential = AzureCliCredential()
        token = credential.get_token("https://confidential-ledger.azure.com/.default")
        print("  ✓ Azure CLI authentication successful")
    
    print("\n[2/2] Getting ledger identity certificate...")
    # Extract ledger ID from URL
    ledger_id = ledger_url.replace("https://", "").replace(".confidential-ledger.azure.com", "")
    
    try:
        identity_client = ConfidentialLedgerCertificateClient()
        network_identity = identity_client.get_ledger_identity(
            ledger_id=ledger_id
        )
        print("  ✓ Ledger identity certificate retrieved")
    except Exception as e:
        print(f"  ✗ Failed to get ledger identity: {e}")
        print("  Continuing without certificate verification...")
        network_identity = None
    
    print("\n[3/3] Creating ledger client...")
    ledger_tls_cert_file_name = None
    if network_identity:
        # Save certificate temporarily
        ledger_tls_cert_file_name = f"{ledger_id}_certificate.pem"
        with open(ledger_tls_cert_file_name, "w") as cert_file:
            cert_file.write(network_identity.ledger_tls_certificate)
    
    client = ConfidentialLedgerClient(
        endpoint=ledger_url,
        credential=credential,
        ledger_certificate_path=ledger_tls_cert_file_name
    )
    print("  ✓ Client created successfully\n")
    
    return client


def write_entry(client: ConfidentialLedgerClient):
    """Write an entry to the ledger."""
    print("\n" + "=" * 70)
    print("Write Entry to Ledger")
    print("=" * 70)
    
    collection_id = get_input("Collection ID (press Enter for default)", "default")
    
    print("\nEntry content format:")
    print("  1. Simple text")
    print("  2. JSON object")
    content_type = get_choice("Select content type", ["Text", "JSON"], "Text")
    
    if content_type == "JSON":
        print("\nEnter JSON content (press Ctrl+D or Ctrl+Z when done):")
        lines = []
        try:
            while True:
                line = input()
                lines.append(line)
        except EOFError:
            pass
        content = "\n".join(lines)
        try:
            # Validate JSON
            json.loads(content)
        except json.JSONDecodeError as e:
            print(f"\n✗ Invalid JSON: {e}")
            return
    else:
        content = get_input("Entry content")
    
    try:
        print("\nWriting entry to ledger...")
        result = client.create_ledger_entry(
            entry={"contents": content},
            collection_id=collection_id
        )
        
        print("\n✓ Entry written successfully!")
        print(f"  Transaction ID: {result['transactionId']}")
        print(f"  Collection ID: {collection_id}")
        
    except HttpResponseError as e:
        print(f"\n✗ Error writing entry: {e}")
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")


def read_entry(client: ConfidentialLedgerClient):
    """Read an entry from the ledger."""
    print("\n" + "=" * 70)
    print("Read Entry from Ledger")
    print("=" * 70)
    
    collection_id = get_input("Collection ID (press Enter for default)", "default")
    
    read_type = get_choice(
        "Select read type",
        ["Current (latest) entry", "Entry by transaction ID"],
        "Current (latest) entry"
    )
    
    try:
        if read_type == "Current (latest) entry":
            print("\nRetrieving current entry...")
            result = client.get_current_ledger_entry(collection_id=collection_id)
            
            print("\n✓ Entry retrieved successfully!")
            print(f"  Transaction ID: {result.get('transactionId', 'N/A')}")
            print(f"  Collection ID: {collection_id}")
            print(f"\nContent:")
            
            # Parse and display content
            contents = result.get('contents', '')
            try:
                parsed = json.loads(contents)
                print(json.dumps(parsed, indent=2))
            except (json.JSONDecodeError, TypeError):
                print(contents)
                
        else:
            transaction_id = get_input("Transaction ID")
            print(f"\nRetrieving entry for transaction {transaction_id}...")
            
            result = client.get_ledger_entry(
                transaction_id=transaction_id,
                collection_id=collection_id
            )
            
            print("\n✓ Entry retrieved successfully!")
            print(f"  Transaction ID: {transaction_id}")
            print(f"  Collection ID: {collection_id}")
            print(f"\nContent:")
            
            # Parse and display content
            contents = result.get('contents', '')
            try:
                parsed = json.loads(contents)
                print(json.dumps(parsed, indent=2))
            except (json.JSONDecodeError, TypeError):
                print(contents)
        
        # Display additional metadata if available
        if 'collectionId' in result:
            print(f"\nMetadata:")
            for key, value in result.items():
                if key not in ['contents']:
                    print(f"  {key}: {value}")
                    
    except ResourceNotFoundError:
        print(f"\n✗ Entry not found")
    except HttpResponseError as e:
        print(f"\n✗ Error reading entry: {e}")
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")


def list_entries(client: ConfidentialLedgerClient):
    """List entries from the ledger."""
    print("\n" + "=" * 70)
    print("List Entries from Ledger")
    print("=" * 70)
    
    collection_id = get_input("Collection ID (press Enter for default)", "default")
    from_tx_id = get_input("Start from transaction ID (optional, press Enter to skip)", "")
    
    try:
        print("\nRetrieving entries...")
        
        kwargs = {"collection_id": collection_id}
        if from_tx_id:
            kwargs["from_transaction_id"] = from_tx_id
        
        entries = client.list_ledger_entries(**kwargs)
        
        print("\n✓ Entries retrieved successfully!")
        print(f"\nCollection: {collection_id}")
        print("-" * 70)
        
        count = 0
        for entry in entries:
            count += 1
            tx_id = entry.get('transactionId', 'N/A')
            contents = entry.get('contents', '')
            
            print(f"\nTransaction ID: {tx_id}")
            try:
                parsed = json.loads(contents)
                print(f"Content: {json.dumps(parsed, indent=2)}")
            except (json.JSONDecodeError, TypeError):
                print(f"Content: {contents}")
            
            if count >= 10:
                more = get_choice("\nShowing first 10 entries. Continue?", ["Yes", "No"], "No")
                if more == "No":
                    break
                count = 0
        
        print(f"\n✓ Displayed entries from collection '{collection_id}'")
        
    except HttpResponseError as e:
        print(f"\n✗ Error listing entries: {e}")
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")


def get_receipt(client: ConfidentialLedgerClient):
    """Get a receipt for a transaction."""
    print("\n" + "=" * 70)
    print("Get Transaction Receipt")
    print("=" * 70)
    
    transaction_id = get_input("Transaction ID")
    
    try:
        print(f"\nRetrieving receipt for transaction {transaction_id}...")
        result = client.get_receipt(transaction_id=transaction_id)
        
        print("\n✓ Receipt retrieved successfully!")
        print(f"\nTransaction ID: {transaction_id}")
        print("-" * 70)
        print(json.dumps(result, indent=2))
        
    except ResourceNotFoundError:
        print(f"\n✗ Receipt not found for transaction {transaction_id}")
    except HttpResponseError as e:
        print(f"\n✗ Error getting receipt: {e}")
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")


def get_transaction_status(client: ConfidentialLedgerClient):
    """Get the status of a transaction."""
    print("\n" + "=" * 70)
    print("Get Transaction Status")
    print("=" * 70)
    
    transaction_id = get_input("Transaction ID")
    
    try:
        print(f"\nChecking status for transaction {transaction_id}...")
        result = client.get_transaction_status(transaction_id=transaction_id)
        
        state = result.get('state', 'Unknown')
        print("\n✓ Transaction status retrieved!")
        print(f"  Transaction ID: {transaction_id}")
        print(f"  State: {state}")
        
        if state == "Committed":
            print("\n  ✓ Transaction has been committed to the ledger")
        elif state == "Pending":
            print("\n  ⏳ Transaction is pending")
        else:
            print(f"\n  Status: {state}")
            
    except ResourceNotFoundError:
        print(f"\n✗ Transaction not found: {transaction_id}")
    except HttpResponseError as e:
        print(f"\n✗ Error getting status: {e}")
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")


def list_collections(client: ConfidentialLedgerClient):
    """List all collections in the ledger."""
    print("\n" + "=" * 70)
    print("List Collections")
    print("=" * 70)
    
    try:
        print("\nRetrieving collections...")
        collections = client.list_collections()
        
        print("\n✓ Collections retrieved successfully!")
        print("\nAvailable Collections:")
        print("-" * 70)
        
        collection_list = list(collections)
        if collection_list:
            for i, collection in enumerate(collection_list, 1):
                collection_id = collection.get('collectionId', 'Unknown')
                print(f"  {i}. {collection_id}")
        else:
            print("  No collections found")
        
    except HttpResponseError as e:
        print(f"\n✗ Error listing collections: {e}")
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")


def manage_users(client: ConfidentialLedgerClient):
    """Manage ledger users."""
    print("\n" + "=" * 70)
    print("User Management")
    print("=" * 70)
    
    action = get_choice(
        "Select action",
        ["List users", "Get user details", "Add/Update user", "Delete user"],
        "List users"
    )
    
    try:
        if action == "List users":
            print("\nRetrieving users...")
            users = client.list_users()
            
            print("\n✓ Users retrieved successfully!")
            print("\nLedger Users:")
            print("-" * 70)
            
            user_list = list(users)
            if user_list:
                for i, user in enumerate(user_list, 1):
                    user_id = user.get('userId', 'Unknown')
                    assigned_role = user.get('assignedRole', 'Unknown')
                    print(f"  {i}. User ID: {user_id}")
                    print(f"     Role: {assigned_role}")
            else:
                print("  No users found")
                
        elif action == "Get user details":
            user_id = get_input("User ID (AAD object ID)")
            print(f"\nRetrieving user {user_id}...")
            
            user = client.get_user(user_id=user_id)
            
            print("\n✓ User details retrieved!")
            print(json.dumps(user, indent=2))
            
        elif action == "Add/Update user":
            user_id = get_input("User ID (AAD object ID)")
            role = get_choice(
                "Select role",
                ["Administrator", "Contributor", "Reader"],
                "Reader"
            )
            
            print(f"\nAdding/Updating user {user_id} with role {role}...")
            
            client.create_or_update_user(
                user_id=user_id,
                user={"assignedRole": role}
            )
            
            print(f"\n✓ User {user_id} added/updated with role {role}")
            
        elif action == "Delete user":
            user_id = get_input("User ID (AAD object ID)")
            confirm = get_choice(
                f"Are you sure you want to delete user {user_id}?",
                ["Yes", "No"],
                "No"
            )
            
            if confirm == "Yes":
                print(f"\nDeleting user {user_id}...")
                client.delete_user(user_id=user_id)
                print(f"\n✓ User {user_id} deleted")
            else:
                print("\nOperation cancelled")
                
    except ResourceNotFoundError:
        print(f"\n✗ User not found")
    except HttpResponseError as e:
        print(f"\n✗ Error managing users: {e}")
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")


def view_ledger_info(client: ConfidentialLedgerClient):
    """View ledger information."""
    print("\n" + "=" * 70)
    print("Ledger Information")
    print("=" * 70)
    
    info_type = get_choice(
        "Select information type",
        ["Consortium members", "Enclave quotes", "Constitution"],
        "Consortium members"
    )
    
    try:
        if info_type == "Consortium members":
            print("\nRetrieving consortium members...")
            members = client.list_consortium_members()
            
            print("\n✓ Consortium members retrieved!")
            print("\nMembers:")
            print("-" * 70)
            
            member_list = list(members)
            if member_list:
                for i, member in enumerate(member_list, 1):
                    print(f"\n  Member {i}:")
                    print(json.dumps(member, indent=4))
            else:
                print("  No members found")
                
        elif info_type == "Enclave quotes":
            print("\nRetrieving enclave quotes...")
            quotes = client.get_enclave_quotes()
            
            print("\n✓ Enclave quotes retrieved!")
            print(json.dumps(quotes, indent=2))
            
        elif info_type == "Constitution":
            print("\nRetrieving constitution...")
            constitution = client.get_constitution()
            
            print("\n✓ Constitution retrieved!")
            print("\nConstitution:")
            print("-" * 70)
            print(constitution)
            
    except HttpResponseError as e:
        print(f"\n✗ Error retrieving information: {e}")
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")


def main_menu(client: ConfidentialLedgerClient):
    """Display main menu and handle user interactions."""
    
    while True:
        print("\n" + "=" * 70)
        print("Main Menu")
        print("=" * 70)
        
        choice = get_choice(
            "Select an operation",
            [
                "Write entry",
                "Read entry",
                "List entries",
                "Get transaction receipt",
                "Get transaction status",
                "List collections",
                "Manage users",
                "View ledger information",
                "Exit"
            ],
            "Exit"
        )
        
        if choice == "Write entry":
            write_entry(client)
        elif choice == "Read entry":
            read_entry(client)
        elif choice == "List entries":
            list_entries(client)
        elif choice == "Get transaction receipt":
            get_receipt(client)
        elif choice == "Get transaction status":
            get_transaction_status(client)
        elif choice == "List collections":
            list_collections(client)
        elif choice == "Manage users":
            manage_users(client)
        elif choice == "View ledger information":
            view_ledger_info(client)
        elif choice == "Exit":
            print("\nExiting...")
            break
        
        input("\nPress Enter to continue...")


def main():
    """Main function to run the interactive ledger operations."""
    print_banner()
    
    print("This script provides interactive access to Confidential Ledger operations.")
    print("You'll need the ledger Endpoint to connect.\n")
    
    # Get ledger URL
    ledger_url = get_input("Ledger Endpoint (e.g., https://my-ledger.confidential-ledger.azure.com)")
    
    while not ledger_url or not ledger_url.startswith("https://"):
        print("  Error: Please provide a valid HTTPS URL")
        ledger_url = get_input("Ledger Endpoint (e.g., https://my-ledger.confidential-ledger.azure.com)")
    
    try:
        # Create client
        client = create_ledger_client(ledger_url)
        
        # Show main menu
        main_menu(client)
        
        # Close client
        client.close()
        print("\n✓ Session closed successfully")
        
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\n✗ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\n\nUnexpected error: {e}")
        sys.exit(1)
