#!/usr/bin/env bash

set -x

az deployment group create \
  --resource-group cjensen-1 --name "cjensen-1-2" --parameters name="cjensen-1-2-1" \
  --template-file arm-template.json \
  --parameters ssh="$(cat ~/.ssh/id_rsa.pub)"