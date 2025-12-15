#!/usr/bin/env python3
"""
Interactive script to create an Azure Confidential Ledger using the Python SDK.

This script provides a simple interactive experience for creating a new
Confidential Ledger instance in Azure, asking for all required parameters.

Prerequisites:
- Install dependencies: pip install -r requirements.txt
- Azure CLI authentication or appropriate credentials configured
- Sufficient Azure permissions to create Confidential Ledger resources
"""

import sys
import os
from typing import Optional
from azure.identity import DefaultAzureCredential, AzureCliCredential
from azure.mgmt.confidentialledger import ConfidentialLedger as ConfidentialLedgerMgmtClient
from azure.mgmt.confidentialledger.models import (
    ConfidentialLedger,
    LedgerProperties,
    AADBasedSecurityPrincipal,
    LedgerType,
    LedgerRoleName
)
from azure.core.exceptions import HttpResponseError


def print_banner():
    """Print a welcome banner."""
    print("=" * 70)
    print("  Azure Confidential Ledger - Interactive Creation Script")
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


def validate_resource_name(name: str) -> bool:
    """
    Validate Azure resource name.
    
    Args:
        name: Resource name to validate
        
    Returns:
        True if valid, False otherwise
    """
    if not name:
        return False
    if len(name) < 3 or len(name) > 24:
        print("  Error: Name must be between 3 and 24 characters")
        return False
    if not name.replace("-", "").isalnum():
        print("  Error: Name can only contain alphanumeric characters and hyphens")
        return False
    return True


def get_azure_locations() -> list:
    """Get common Azure locations for Confidential Ledger."""
    return [
        "eastus",
        "westus",
        "westus2",
        "westeurope",
        "northeurope",
        "southcentralus",
        "uksouth",
        "australiaeast",
        "southeastasia",
        "japaneast"
    ]


def create_confidential_ledger(
    subscription_id: str,
    resource_group_name: str,
    ledger_name: str,
    location: str,
    ledger_type: str,
    aad_principal_id: Optional[str] = None,
    aad_tenant_id: Optional[str] = None
) -> None:
    """
    Create an Azure Confidential Ledger.
    
    Args:
        subscription_id: Azure subscription ID
        resource_group_name: Resource group name
        ledger_name: Name for the new ledger
        location: Azure location
        ledger_type: Type of ledger (Public or Private)
        aad_principal_id: Optional AAD principal (user/service principal) object ID
        aad_tenant_id: Optional AAD tenant ID
    """
    print("\n" + "=" * 70)
    print("Creating Confidential Ledger...")
    print("=" * 70)
    
    try:
        # Authenticate using Azure credentials
        print("\n[1/4] Authenticating with Azure...")
        try:
            credential = DefaultAzureCredential()
            # Test the credential
            token = credential.get_token("https://management.azure.com/.default")
            print("  ✓ Authentication successful")
        except Exception as e:
            print(f"  ✗ Default authentication failed: {e}")
            print("\n  Trying Azure CLI authentication...")
            credential = AzureCliCredential()
            token = credential.get_token("https://management.azure.com/.default")
            print("  ✓ Azure CLI authentication successful")
        
        # Create management client
        print("\n[2/4] Creating management client...")
        client = ConfidentialLedgerMgmtClient(
            credential=credential,
            subscription_id=subscription_id
        )
        print("  ✓ Client created successfully")
        
        # Prepare ledger properties
        print("\n[3/4] Preparing ledger configuration...")
        
        # Set up AAD-based security principals if provided
        aad_principals = []
        if aad_principal_id and aad_tenant_id:
            aad_principals.append(
                AADBasedSecurityPrincipal(
                    principal_id=aad_principal_id,
                    tenant_id=aad_tenant_id,
                    ledger_role_name=LedgerRoleName.ADMINISTRATOR
                )
            )
            print(f"  ✓ Added AAD principal as Administrator")
        
        # Determine ledger type
        ledger_type_enum = LedgerType.PUBLIC if ledger_type == "Public" else LedgerType.PRIVATE
        
        properties = LedgerProperties(
            ledger_type=ledger_type_enum,
            aad_based_security_principals=aad_principals if aad_principals else None
        )
        
        ledger = ConfidentialLedger(
            location=location,
            properties=properties
        )
        
        print(f"  ✓ Configuration prepared")
        print(f"    - Ledger Type: {ledger_type}")
        print(f"    - Location: {location}")
        
        # Create the ledger
        print(f"\n[4/4] Creating ledger '{ledger_name}'...")
        print("  This may take several minutes...")
        
        poller = client.ledger.begin_create(
            resource_group_name=resource_group_name,
            ledger_name=ledger_name,
            confidential_ledger=ledger
        )
        
        # Wait for completion
        result = poller.result()
        
        print("\n" + "=" * 70)
        print("  ✓ Confidential Ledger created successfully!")
        print("=" * 70)
        print(f"\nLedger Details:")
        print(f"  Name: {result.name}")
        print(f"  ID: {result.id}")
        print(f"  Location: {result.location}")
        print(f"  Type: {result.properties.ledger_type}")
        
        if hasattr(result.properties, 'ledger_uri') and result.properties.ledger_uri:
            print(f"  Ledger URI: {result.properties.ledger_uri}")
        
        if hasattr(result.properties, 'identity_service_uri') and result.properties.identity_service_uri:
            print(f"  Identity Service URI: {result.properties.identity_service_uri}")
        
        print(f"\nProvisioning State: {result.properties.provisioning_state}")
        print()
        
    except HttpResponseError as e:
        print(f"\n✗ Error creating ledger: {e.message}")
        print(f"  Status Code: {e.status_code}")
        if hasattr(e, 'error') and e.error:
            print(f"  Error Code: {e.error.code}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        sys.exit(1)


def main():
    """Main function to run the interactive ledger creation."""
    print_banner()
    
    print("This script will guide you through creating a new Azure Confidential Ledger.")
    print("Please have the following information ready:")
    print("  - Azure Subscription ID")
    print("  - Resource Group Name (existing)")
    print("  - Desired Ledger Name")
    print("  - Azure Location")
    print("  - Optional: AAD Principal ID and Tenant ID for administrator access")
    print()
    
    # Get subscription ID
    subscription_id = get_input("Azure Subscription ID")
    while not subscription_id:
        print("  Error: Subscription ID is required")
        subscription_id = get_input("Azure Subscription ID")
    
    # Get resource group name
    resource_group_name = get_input("Resource Group Name")
    while not resource_group_name:
        print("  Error: Resource Group Name is required")
        resource_group_name = get_input("Resource Group Name")
    
    # Get ledger name
    ledger_name = get_input("Ledger Name")
    while not validate_resource_name(ledger_name):
        ledger_name = get_input("Ledger Name")
    
    # Get location
    print("\nAvailable Azure Locations:")
    locations = get_azure_locations()
    location = get_choice("Select Azure Location", locations, "eastus")
    
    # Get ledger type
    ledger_type = get_choice(
        "Select Ledger Type",
        ["Public", "Private"],
        "Public"
    )
    
    # Optional: Get AAD principal information
    print("\n" + "-" * 70)
    print("Optional: Configure Administrator Access")
    print("-" * 70)
    print("You can configure an Azure AD principal as an administrator.")
    print("This is optional but recommended for accessing the ledger after creation.")
    
    configure_admin = get_choice(
        "\nDo you want to configure an administrator?",
        ["Yes", "No"],
        "No"
    )
    
    aad_principal_id = None
    aad_tenant_id = None
    
    if configure_admin == "Yes":
        aad_principal_id = get_input("\nAAD Principal Object ID")
        aad_tenant_id = get_input("AAD Tenant ID")
    
    # Confirm before creation
    print("\n" + "=" * 70)
    print("Configuration Summary")
    print("=" * 70)
    print(f"  Subscription ID: {subscription_id}")
    print(f"  Resource Group: {resource_group_name}")
    print(f"  Ledger Name: {ledger_name}")
    print(f"  Location: {location}")
    print(f"  Ledger Type: {ledger_type}")
    if aad_principal_id:
        print(f"  AAD Principal ID: {aad_principal_id}")
        print(f"  AAD Tenant ID: {aad_tenant_id}")
    print("=" * 70)
    
    confirm = get_choice("\nProceed with creation?", ["Yes", "No"], "Yes")
    
    if confirm != "Yes":
        print("\nOperation cancelled.")
        sys.exit(0)
    
    # Create the ledger
    create_confidential_ledger(
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        ledger_name=ledger_name,
        location=location,
        ledger_type=ledger_type,
        aad_principal_id=aad_principal_id,
        aad_tenant_id=aad_tenant_id
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\n\nUnexpected error: {e}")
        sys.exit(1)
