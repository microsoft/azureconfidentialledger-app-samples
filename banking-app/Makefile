SHELL := /bin/bash

.PHONY: help
.DEFAULT_GOAL := help

check_defined = \
    $(strip $(foreach 1,$1, \
        $(call __check_defined,$1,$(strip $(value 2)))))
__check_defined = \
    $(if $(value $1),, \
      $(error Undefined $1$(if $2, ($2))))

help: ## 💬 This help message :)
	@grep -E '[a-zA-Z_-]+:.*?## .*$$' $(firstword $(MAKEFILE_LIST)) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

build: ## 🔨 Build the Banking Application
	@echo -e "\e[34m$@\e[0m" || true
	@npm run build

test: build ## 🧪 Test the Banking Application in ACL
	@echo -e "\e[34m$@\e[0m" || true
	@. ../scripts/test_acl.sh --subscription "<subscription id>" --tenant "<tenant id>" --app-dir ${CURDIR}

clean: ## 🧹 Clean the working folders created during build
	@rm -rf dist
