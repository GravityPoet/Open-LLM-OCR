#!/usr/bin/env python3
"""Run a Roboflow Workflow without exposing a key in source code.

Usage:
  ROBOFLOW_API_KEY=... python3 scripts/roboflow-workflow-example.py image.png
"""
from __future__ import annotations

import base64
import json
import os
import pathlib
import sys
import urllib.request


ENDPOINT = os.environ.get(
    "ROBOFLOW_WORKFLOW_ENDPOINT",
    "https://serverless.roboflow.com/ashers-workspace-u0hh3/workflows/claude-haiku-5-5-ocr",
)


def main() -> int:
    if len(sys.argv) != 2:
        print(f"用法：ROBOFLOW_API_KEY=... python3 {sys.argv[0]} 图片路径", file=sys.stderr)
        return 2
    key = os.environ.get("ROBOFLOW_API_KEY", "").strip()
    if not key:
        print("缺少 ROBOFLOW_API_KEY。", file=sys.stderr)
        return 2
    image = pathlib.Path(sys.argv[1])
    payload = {
        "api_key": key,
        "inputs": {
            "image": {
                "type": "base64",
                "value": base64.b64encode(image.read_bytes()).decode("ascii"),
            }
        },
    }
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        result = json.load(response)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
