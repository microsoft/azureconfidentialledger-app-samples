.PHONY: build clean deploy test

# Build the UDE bundle
build:
	npm install
	npm run build

# Clean build artifacts
clean:
	npm run clean

# Deploy the bundle to Azure Confidential Ledger
# Requires: LEDGER_NAME environment variable set
deploy: build
	pwsh -File deploy.ps1

# Run end-to-end tests
# Requires: LEDGER_NAME or LEDGER_URL environment variable set
test:
	pwsh -File test/test-e2e.ps1
