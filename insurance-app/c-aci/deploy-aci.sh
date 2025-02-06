#!/usr/bin/env bash

source env.sh

# Deploy primary container and sidecar using ./arm-template.json
az deployment group create \
  --resource-group $ResourceGroup \
  --template-file arm-template.json --parameters @parameters.json

echo Hosted container on: "$(az container show -g $ResourceGroup -n ${DeploymentName} --query ipAddress.ip -o tsv)"