#!/usr/bin/env bash

source env.sh

# Build primary container
ImageName=${ACRPrefix}.azurecr.io/${PrimaryName}
docker build -t $ImageName --build-arg HUGGINGFACE_TOKEN=$HUGGINGFACE_TOKEN .
docker login \
  -u 00000000-0000-0000-0000-000000000000 \
  -p $(az acr login --name ${ACRPrefix} --expose-token --output tsv --query accessToken) \
  ${ACRPrefix}.azurecr.io
docker push $ImageName

# Set up new arm-template.json
jq ".resources[0].properties.confidentialComputeProperties.ccePolicy = \"\"" arm-template.template.json > arm-template.json

# Build parameters.json for arm-template.json
PATTERN=".parameters.name.value = \"${DeploymentName}\""
PATTERN="${PATTERN} | .parameters.\"primary-image\".value = \"${ImageName}\""
PATTERN="${PATTERN} | .parameters.\"sidecar-image\".value = \"${ACRPrefix}.azurecr.io/attestation-sidecar\""
PATTERN="${PATTERN} | .parameters.\"acr-name\".value = \"${ACRPrefix}.azurecr.io\""
PATTERN="${PATTERN} | .parameters.\"acr-token\".value = \"$(az acr login --name $ACRPrefix --expose-token --output tsv --query accessToken)\""
PATTERN="${PATTERN} | .parameters.ssh.value = \"$(cat ~/.ssh/id_rsa.pub)\""
set -x
jq "$PATTERN" parameters.template.json > parameters.json

# Update arm-template policy
az confcom acipolicygen -y -a arm-template.json -p parameters.json
