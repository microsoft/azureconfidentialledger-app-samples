#!/bin/bash
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the Apache 2.0 License.

set -e

if [ "$1" == "-f" ]; then
  FIX=1
else
  FIX=0
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

ROOT_DIR=$( dirname "$SCRIPT_DIR" )
pushd "$ROOT_DIR" > /dev/null

# GitHub actions workflow commands: https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions
function group(){
    # Only do this in GitHub actions, where CI is defined according to
    # https://docs.github.com/en/actions/learn-github-actions/environment-variables#default-environment-variables
    if [[ ${CI} ]]; then
      echo "::group::$1"
    else
      echo "-=[ $1 ]=-"
    fi
}
function endgroup() {
    if [[ ${CI} ]]; then
      echo "::endgroup::"
    fi
}


group "TypeScript, JavaScript, Markdown, TypeSpec, YAML and JSON format"
npm install --loglevel=error --no-save prettier @typespec/prettier-plugin-typespec 1>/dev/null
if [ $FIX -ne 0 ]; then
  git ls-files | grep -e '\.ts$' -e '\.js$' -e '\.md$' -e '\.yaml$' -e '\.yml$' -e '\.json$' | grep -v -e 'tests/sandbox/' | xargs npx prettier --write
else
  git ls-files | grep -e '\.ts$' -e '\.js$' -e '\.md$' -e '\.yaml$' -e '\.yml$' -e '\.json$' | grep -v -e 'tests/sandbox/' | xargs npx prettier --check
fi
endgroup

group "Python dependencies"
# Virtual Environment w/ dependencies for Python steps
if [ ! -f "scripts/env/bin/activate" ]
    then
        python3 -m venv scripts/env
fi

source scripts/env/bin/activate
pip install -U pip
pip install -U wheel black ruff 1>/dev/null
endgroup

group "Python format"
if [ $FIX -ne 0 ]; then
  git ls-files | grep -e '\.py$' | xargs black
else
  git ls-files | grep -e '\.py$' | xargs black --check
fi
endgroup

group "Python lint dependencies"
# Install test dependencies before linting
pip install -U -r insurance-app/acl-app/scripts/requirements.txt 1>/dev/null
pip install -U -r insurance-app/c-aci/src/requirements.txt 1>/dev/null
endgroup

group "Python lint"
if [ $FIX -ne 0 ]; then
  git ls-files | grep -e '\.py$' | grep -Ev '_pb2_grpc.py|_pb2.py' | xargs ruff check --fix 
else
  git ls-files | grep -e '\.py$' | grep -Ev '_pb2_grpc.py|_pb2.py' | xargs ruff check
fi
endgroup