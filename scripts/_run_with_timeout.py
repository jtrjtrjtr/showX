#!/usr/bin/env python3
"""Cross-platform timeout wrapper. Replaces /usr/bin/timeout for macOS.

Usage: _run_with_timeout.py <seconds> <cmd> [args...]
Exit codes: command's exit code on success, 124 on timeout.
"""
import subprocess
import sys


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: _run_with_timeout.py <seconds> <cmd> [args...]", file=sys.stderr)
        return 2
    try:
        timeout_s = int(sys.argv[1])
    except ValueError:
        print(f"Invalid timeout: {sys.argv[1]}", file=sys.stderr)
        return 2
    args = sys.argv[2:]
    try:
        result = subprocess.run(args, timeout=timeout_s)
        return result.returncode
    except subprocess.TimeoutExpired:
        print(f"[TIMEOUT] Process exceeded {timeout_s}s", file=sys.stderr)
        return 124
    except FileNotFoundError as e:
        print(f"[ERROR] Command not found: {e}", file=sys.stderr)
        return 127


if __name__ == "__main__":
    sys.exit(main())
