# Azure Confidential Ledger (ACL) Sample Applications

Welcome to the Azure Confidential Ledger (ACL) Sample Applications repository! This repository is dedicated to providing a collection of sample applications designed to help developers learn, understand and develop applications that can be deployed on Azure Confidential Ledger service.

## About Azure Confidential Ledger

Azure Confidential Ledger (ACL) is a secure and tamper-proof ledger service that leverages the power of Azure's confidential computing capabilities. It ensures the integrity and confidentiality of your data, making it an ideal solution for scenarios that require high levels of security and trust.

## Repository Contents

In this repository, you will find a variety of sample applications that demonstrate how to develop and deploy applications targeting the Azure Confidential Ledger service. Each sample includes detailed instructions and code examples to help you get started quickly.

# Azure Confidential Ledger App Samples [![Open in VSCode](https://img.shields.io/static/v1?label=Open+in&message=VSCode&logo=visualstudiocode&color=007ACC&logoColor=007ACC&labelColor=2C2C32)](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/microsoft/azureconfidentialledger-app-samples)

## Prerequisites

To build and run these sample applications locally, you'll need the following tools installed:

### Required Tools

- **Node.js** (version 16 or higher)
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify installation: `node --version`
  
- **npm** (comes with Node.js)
  - Verify installation: `npm --version`

- **Bash shell** (for running test scripts)
  - **Linux/macOS**: Available by default
  - **Windows**: Use Git Bash (comes with [Git for Windows](https://git-scm.com/download/win)), WSL (Windows Subsystem for Linux), or similar

- **Make** (for running Makefiles)
  - **Linux**: Usually pre-installed, or install via `apt-get install make` (Debian/Ubuntu) or `yum install make` (RHEL/CentOS)
  - **macOS**: Install via Xcode Command Line Tools: `xcode-select --install`
  - **Windows**: Install via [Chocolatey](https://chocolatey.org/): `choco install make`, or use WSL

- **OpenSSL** (for certificate generation)
  - **Linux**: Usually pre-installed, or install via `apt-get install openssl` (Debian/Ubuntu)
  - **macOS**: Pre-installed
  - **Windows**: Available via Git Bash, or install from [slproweb.com/products/Win32OpenSSL.html](https://slproweb.com/products/Win32OpenSSL.html)
  - Verify installation: `openssl version`

- **curl** (for API testing)
  - **Linux**: Usually pre-installed, or install via `apt-get install curl` (Debian/Ubuntu)
  - **macOS**: Pre-installed
  - **Windows**: Available in Windows 10+ by default, or via Git Bash
  - Verify installation: `curl --version`

- **Azure CLI** (for deploying and managing Azure resources)
  - Install from [docs.microsoft.com/cli/azure/install-azure-cli](https://docs.microsoft.com/cli/azure/install-azure-cli)
  - Verify installation: `az --version`
  - Login to Azure: `az login`

### Optional but Recommended

- **Git** (for cloning the repository)
  - Download from [git-scm.com](https://git-scm.com/)

### Azure Subscription Requirements

- An active Azure subscription
- Permissions to create and manage Azure Confidential Ledger instances
- Permissions to create and manage resource groups

## Quickstart

The quickest way to build and run sample applications is to checkout this repository locally in its development container by clicking:

[![Open in VSCode](https://img.shields.io/static/v1?label=Open+in&message=VSCode&logo=visualstudiocode&color=007ACC&logoColor=007ACC&labelColor=2C2C32)](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/microsoft/azureconfidentialledger-app-samples)

All dependencies will be automatically installed (takes ~2 mins on first checkout).

Alternatively, if your organisation supports it, you can checkout this repository in a Github codespace:

[![Open in GitHub Codespaces](https://img.shields.io/static/v1?label=Open+in&message=GitHub+codespace&logo=github&color=2F363D&logoColor=white&labelColor=2C2C32)](https://github.com/codespaces/new?hide_repo_select=true&repo=microsoft%2Fazureconfidentialledger-app-samples)

Please choose a sample to learn more.

- [Banking App](./banking-app/README.md)
- [Insurance App](./insurance-app/README.md)

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
