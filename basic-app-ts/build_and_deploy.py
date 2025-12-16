#!/usr/bin/env python3
"""
Deployment script for basic-app-ts
Builds the TypeScript app and deploys it to Azure Confidential Ledger
"""

import subprocess
import sys
import os
import json
import tempfile
from pathlib import Path

def run_command(cmd, cwd=None, check=True):
    """Run a shell command and return the result"""
    print(f"Running: {cmd}")
    result = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False
    )
    
    if result.stdout:
        print(result.stdout)
    if result.stderr and result.returncode != 0:
        print(f"Error: {result.stderr}", file=sys.stderr)
    
    if check and result.returncode != 0:
        print(f"Command failed with exit code {result.returncode}")
        sys.exit(1)
    
    return result

def check_prerequisites():
    """Check if required tools are installed"""
    print("\n=== Checking Prerequisites ===")
    
    required_tools = {
        'node': 'node --version',
        'npm': 'npm --version',
        'az': 'az --version',
    }
    
    missing_tools = []
    for tool, check_cmd in required_tools.items():
        result = run_command(check_cmd, check=False)
        if result.returncode != 0:
            missing_tools.append(tool)
            print(f"❌ {tool} not found")
        else:
            print(f"✅ {tool} found")
    
    # Check for openssl - try multiple locations on Windows
    openssl_found = False
    openssl_paths = [
        'openssl',  # In PATH
        r'C:\Program Files\Git\usr\bin\openssl.exe',  # Git Bash
        r'C:\Program Files (x86)\Git\usr\bin\openssl.exe',  # Git Bash 32-bit
    ]
    
    for openssl_cmd in openssl_paths:
        result = run_command(f'"{openssl_cmd}" version', check=False)
        if result.returncode == 0:
            openssl_found = True
            print(f"✅ openssl found")
            globals()['OPENSSL_CMD'] = openssl_cmd
            break
    
    if not openssl_found:
        missing_tools.append('openssl')
        print(f"❌ openssl not found")
        print("   Try: choco install openssl")
        print("   Or install Git for Windows which includes OpenSSL")
    
    if missing_tools:
        print(f"\n❌ Missing required tools: {', '.join(missing_tools)}")
        print("Please install them before continuing.")
        sys.exit(1)
    
    print("\n✅ All prerequisites satisfied!\n")

def build_app():
    """Build the TypeScript application"""
    print("\n=== Building Application ===")
    
    script_dir = Path(__file__).parent
    
    print("Installing npm dependencies...")
    run_command("npm install", cwd=script_dir)
    
    print("\nBuilding application...")
    run_command("npm run build", cwd=script_dir)
    
    bundle_path = script_dir / "dist" / "bundle.json"
    if not bundle_path.exists():
        print(f"❌ Build failed: {bundle_path} not found")
        sys.exit(1)
    
    print(f"✅ Build successful! Bundle created at: {bundle_path}\n")
    return bundle_path

def get_user_input():
    """Get deployment configuration from user"""
    print("\n=== Deployment Configuration ===")
    
    # Check if user is logged into Azure
    result = run_command("az account show", check=False)
    if result.returncode != 0:
        print("❌ Not logged into Azure. Please run: az login")
        sys.exit(1)
    
    account_info = json.loads(result.stdout)
    subscription_id = account_info['id']
    tenant_id = account_info['tenantId']
    
    print(f"\nCurrent Azure subscription: {account_info['name']}")
    print(f"Subscription ID: {subscription_id}")
    print(f"Tenant ID: {tenant_id}")
    
    use_current = input("\nUse this subscription? (y/n): ").lower().strip()
    if use_current != 'y':
        print("Please run 'az account set --subscription <subscription-id>' to switch subscriptions")
        sys.exit(0)
    
    ledger_name = input("\nEnter Azure Confidential Ledger name: ").strip()
    if not ledger_name:
        print("❌ Ledger name is required")
        sys.exit(1)
    
    resource_group = input("Enter resource group name: ").strip()
    if not resource_group:
        print("❌ Resource group name is required")
        sys.exit(1)
    
    config = {
        'subscription_id': subscription_id,
        'tenant_id': tenant_id,
        'ledger_name': ledger_name,
        'resource_group': resource_group
    }
    
    return config

def get_azure_token():
    """Get Azure AD access token for Confidential Ledger"""
    result = run_command(
        'az account get-access-token --resource https://confidential-ledger.azure.com --query accessToken -o tsv',
        check=False
    )
    if result.returncode == 0:
        return result.stdout.strip()
    return None

def deploy_app(config, bundle_path, cert_path=None, key_path=None):
    """Deploy the application bundle to the ledger"""
    print("\n=== Deploying Application ===")
    
    ledger_url = f"https://{config['ledger_name']}.confidential-ledger.azure.com"
    api_version = "2024-12-09-preview"
    
    print(f"Deploying to: {ledger_url}")
    print(f"Auth method: Azure AD token")
    
    token = get_azure_token()
    if not token:
        print("❌ Failed to get Azure AD token")
        return False
    
    cmd = (
        f'curl -k -X PUT '
        f'"{ledger_url}/app/userDefinedEndpoints?api-version={api_version}" '
        f'-H "Content-Type: application/json" '
        f'-H "Authorization: Bearer {token}" '
        f'-d @{bundle_path} '
        f'-s -o /dev/null -w "%{{http_code}}"'
    )
    
    result = run_command(cmd, check=False)
    status_code = result.stdout.strip()
    
    if status_code == "201":
        print("✅ Application deployed successfully!\n")
        return True
    else:
        print(f"❌ Deployment failed with status code: {status_code}")
        if result.stderr:
            print(f"Error details: {result.stderr}")
        return False

def save_config(config, cert_path=None, key_path=None):
    """Save configuration for later use"""
    script_dir = Path(__file__).parent
    config_file = script_dir / ".deploy_config.json"
    
    save_data = {
        'ledger_name': config['ledger_name'],
        'resource_group': config['resource_group']
    }
    
    with open(config_file, 'w') as f:
        json.dump(save_data, f, indent=2)
    
    print(f"📝 Configuration saved to {config_file}")
    print(f"   Use test_interactive.py to test the deployed app\n")

def main():
    """Main deployment workflow"""
    print("=" * 60)
    print("  Azure Confidential Ledger - Deploy Script")
    print("=" * 60)
    
    try:
        # Step 1: Check prerequisites
        check_prerequisites()
        
        # Step 2: Build the app
        bundle_path = build_app()
        
        # Step 3: Get user configuration
        config = get_user_input()
        
        # Step 4: Deploy the app
        if not deploy_app(config, bundle_path):
            print("❌ Deployment failed")
            sys.exit(1)
        
        # Step 6: Save config for testing
        save_config(config)
        
        print("=" * 60)
        print("  Deployment Complete!")
        print("=" * 60)
        print(f"\n✅ Ledger: {config['ledger_name']}")
        print(f"✅ URL: https://{config['ledger_name']}.confidential-ledger.azure.com")
        print(f"\n💡 Run 'python test_interactive.py' to test the application")
        
    except KeyboardInterrupt:
        print("\n\n❌ Deployment cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
