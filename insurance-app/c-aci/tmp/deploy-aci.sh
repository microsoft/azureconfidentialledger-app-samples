#!/usr/bin/env bash

ACRPrefix=cjensentest1
PrimaryName="tpal-test"
ResourceGroup="cjensen-1"
DeploymentName="cjensen-1-aci-test"

## Build primary container
#ImageName=${ACRPrefix}.azurecr.io/${PrimaryName}
#docker build -t $ImageName --build-arg HUGGINGFACE_TOKEN=$HUGGINGFACE_TOKEN .
#docker login \
#  -u 00000000-0000-0000-0000-000000000000 \
#  -p $(az acr login --name ${ACRPrefix} --expose-token --output tsv --query accessToken) \
#  ${ACRPrefix}.azurecr.io
#docker push $ImageName

# Deploy primary container and sidecar using ./arm-template.json
az deployment group create \
  --resource-group $ResourceGroup --parameters name=${DeploymentName} \
  --template-file arm-template.json \
  --parameters ssh="$(cat ~/.ssh/id_rsa.pub)" \
  --parameters primary-image="$ImageName" \
  --parameters sidecar-image="${ACRPrefix}.azurecr.io/attestation-sidecar:maximal" \
  --parameters acr-token="$(az acr login --name $ACRPrefix --expose-token --output tsv --query accessToken)"
