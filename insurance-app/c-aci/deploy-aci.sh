#!/usr/bin/env bash

set -x

az acr build --image tpal-test --registry cjensentest1 --file Dockerfile .

az deployment group create \
  --resource-group cjensen-1 --name "cjensen-1-2" --parameters name="cjensen-1-2-1" \
  --template-file arm-template.json \
  --parameters ssh="$(cat ~/.ssh/id_rsa.pub)" \
  --parameters primary-image="cjensentest1.azurecr.io/tpal-test" \
  --parameters sidecar-image="cjensentest1.azurecr.io/attestation-sidecar" \
  --parameters acr-token="$(az acr login --name cjensentest1 --expose-token --output tsv --query accessToken)"
