# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the Apache 2.0 License.
"""
Copied from CCF tests/infra folder: https://github.com/microsoft/CCF/tree/a5f3b4c5357bf08f99c88fc4fc6b6a179d433b26/tests/infra.
Provides logging utilities.
"""

# pylint: skip-file

from loguru import logger as LOG


def flush_info(lines, log_capture=None, depth=0):
    for line in lines:
        if log_capture is None:
            LOG.opt(colors=True, depth=depth + 1).info(line)
        else:
            log_capture.append(line)
