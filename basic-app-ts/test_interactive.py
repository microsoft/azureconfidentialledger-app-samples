#!/usr/bin/env python3
"""
Interactive testing script for basic-app-ts
Tests the deployed echo endpoint in interactive mode
"""

import subprocess
import sys
import os
import json
import tempfile
from pathlib import Path

def load_config():
    """Load configuration from deploy script"""
    script_dir = Path(__file__).parent
    config_file = script_dir / ".deploy_config.json"
    
    if config_file.exists():
        with open(config_file, 'r') as f:
            return json.load(f)
    return None

def get_user_config():
    """Get configuration from user"""
    print("\n=== Configuration ===")
    
    # Try to load saved config
    saved_config = load_config()
    
    if saved_config:
        print(f"\n✅ Found saved configuration:")
        print(f"   Ledger: {saved_config['ledger_name']}")
        print(f"   Auth: Azure AD token")
        
        use_saved = input("\nUse saved configuration? (y/n): ").lower().strip()
        if use_saved == 'y':
            return saved_config
    
    # Manual configuration
    print("\n⚙️  Manual configuration:")
    
    ledger_name = input("Enter Azure Confidential Ledger name: ").strip()
    if not ledger_name:
        print("❌ Ledger name is required")
        sys.exit(1)
    
    return {'ledger_name': ledger_name}

def get_azure_token():
    """Get Azure AD access token for Confidential Ledger"""
    result = subprocess.run(
        'az account get-access-token --resource https://confidential-ledger.azure.com --query accessToken -o tsv',
        shell=True,
        capture_output=True,
        text=True,
        check=False
    )
    if result.returncode == 0:
        return result.stdout.strip()
    return None

def call_echo_endpoint(config, value):
    """Call the echo endpoint with a value"""
    ledger_url = f"https://{config['ledger_name']}.confidential-ledger.azure.com"
    
    # Create a temporary JSON file for the data
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump({"value": value}, f)
        test_data_file = f.name
    
    try:
        token = get_azure_token()
        if not token:
            return None, "Failed to get Azure AD token. Run 'az login' first."
        
        cmd = (
            f'curl -k -X POST '
            f'"{ledger_url}/app/echo" '
            f'-H "Content-Type: application/json" '
            f'-H "Authorization: Bearer {token}" '
            f'-d @{test_data_file} '
            f'-s'
        )
        
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode == 0 and result.stdout:
            try:
                response = json.loads(result.stdout)
                return response, None
            except json.JSONDecodeError:
                return None, f"Invalid JSON response: {result.stdout}"
        
        return None, result.stderr or "Unknown error"
    finally:
        # Clean up the temp file
        if os.path.exists(test_data_file):
            os.unlink(test_data_file)

def interactive_mode(config):
    """Interactive mode for testing the echo endpoint"""
    print("\n" + "=" * 60)
    print("  Interactive Echo Mode")
    print("=" * 60)
    print(f"Ledger: {config['ledger_name']}")
    print(f"Auth: Azure AD token")
    print("\nType a message to echo (or 'quit' to exit)")
    print()
    
    while True:
        try:
            user_input = input("Enter message: ").strip()
            
            if user_input.lower() in ['quit', 'exit', 'q']:
                print("\n👋 Exiting...\n")
                break
            
            if not user_input:
                print("⚠️  Please enter a non-empty message\n")
                continue
            
            print(f"📤 Sending: {user_input}")
            response, error = call_echo_endpoint(config, user_input)
            
            if response:
                echoed = response.get('echoed_value', '')
                print(f"📥 Received: {echoed}")
                if echoed == user_input:
                    print("✅ Match!\n")
                else:
                    print("⚠️  Response doesn't match input\n")
            else:
                print(f"❌ Error: {error}\n")
        
        except KeyboardInterrupt:
            print("\n\n👋 Exiting...\n")
            break
        except Exception as e:
            print(f"❌ Error: {e}\n")

def main():
    """Main entry point"""
    print("=" * 60)
    print("  Azure Confidential Ledger - Interactive Test")
    print("=" * 60)
    
    try:
        # Get configuration
        config = get_user_config()
        
        if not config:
            print("❌ Failed to get configuration")
            sys.exit(1)
        
        # Run initial test
        print("\n=== Running Initial Test ===")
        test_value = "Hello from basic-app-ts!"
        print(f"Testing with: '{test_value}'")
        
        response, error = call_echo_endpoint(config, test_value)
        
        if response and response.get('echoed_value') == test_value:
            print(f"✅ Connection successful!")
            print(f"Response: {json.dumps(response, indent=2)}")
        else:
            print(f"❌ Connection failed")
            if error:
                print(f"Error: {error}")
            sys.exit(1)
        
        # Enter interactive mode
        interactive_mode(config)
        
    except KeyboardInterrupt:
        print("\n\n❌ Cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
