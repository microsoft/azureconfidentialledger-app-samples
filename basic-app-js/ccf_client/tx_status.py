# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the Apache 2.0 License.
"""
Copied from CCF tests/infra folder: https://github.com/microsoft/CCF/tree/a5f3b4c5357bf08f99c88fc4fc6b6a179d433b26/tests/infra.
Provides utilities for handling transaction status.
"""

# pylint: skip-file

from enum import Enum


class TxStatus(Enum):
    Unknown = "Unknown"
    Pending = "Pending"
    Committed = "Committed"
    Invalid = "Invalid"
