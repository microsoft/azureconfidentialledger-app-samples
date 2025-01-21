#!/usr/bin/env bash

ACRPrefix=cjensentest1
PrimaryName="tpal-insurance-sample"
ResourceGroup="cjensen-1"
DeploymentName="cjensen-1-tpal-insurance-sample"

# Build primary container
ImageName=${ACRPrefix}.azurecr.io/${PrimaryName}
docker build -t $ImageName --build-arg HUGGINGFACE_TOKEN=$HUGGINGFACE_TOKEN .
docker login \
  -u 00000000-0000-0000-0000-000000000000 \
  -p $(az acr login --name ${ACRPrefix} --expose-token --output tsv --query accessToken) \
  ${ACRPrefix}.azurecr.io
docker push $ImageName

set -x 
# Deploy primary container and sidecar using ./arm-template.json
az deployment group create \
  --resource-group $ResourceGroup --parameters name=${DeploymentName} \
  --template-file arm-template.json \
  --parameters ssh="$(cat ~/.ssh/id_rsa.pub)" \
  --parameters primary-image="$ImageName" \
  --parameters sidecar-image="${ACRPrefix}.azurecr.io/attestation-sidecar" \
  --parameters acr-token="$(az acr login --name $ACRPrefix --expose-token --output tsv --query accessToken)"

echo Hosted container on: $(az container show -g $ResourceGroup -n ${DeploymentName} --query ipAddress.ip -o tsv)