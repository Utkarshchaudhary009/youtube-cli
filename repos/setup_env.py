#!/usr/bin/env python3
"""
Idempotent environment setup for the YouTube library eval harness.

Run this at the start of every session in a fresh sandbox — pip, system
packages, and downloaded libraries are all wiped between sessions.

Usage:
    python3 setup_env.py

Equivalent to setup_env.sh, but works even if bash is unavailable. Will:
  1. Bootstrap pip via get-pip.py (if missing)
  2. Install required Python packages with --break-system-packages
  3. Try to install deno (yt-dlp JS challenge solver)
  4. Verify all imports succeed
  5. Print environment report
"""
from __future__ import annotations
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

REQUIRED = [
    "yt-dlp",
    "youtube-transcript-api",
    "pytubefix",
    "mcp>=1.0,<1.3",       # mcp 0.9 lacks FastMCP; 1.x is needed
    "requests",
    "defusedxml",
]


def step(msg: str) -> None:
    print(f"\n\033[1;34m[setup]\033[0m {msg}")


def ok(msg: str) -> None:
    print(f"  \033[1;32m[ok]\033[0m {msg}")


def warn(msg: str) -> None:
    print(f"  \033[1;33m[warn]\033[0m {msg}")


def die(msg: str) -> None:
    print(f"  \033[1;31m[fatal]\033[0m {msg}", file=sys.stderr)
    sys.exit(1)


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def ensure_pip() -> None:
    step("Ensuring pip")
    r = run([sys.executable, "-m", "pip", "--version"])
    if r.returncode == 0:
        ok(f"pip {r.stdout.strip()}")
        return
    warn("pip missing — bootstrapping")
    get_pip = Path(tempfile.gettempdir()) / "get-pip.py"
    if not get_pip.exists():
        with urllib.request.urlopen("https://bootstrap.pypa.io/get-pip.py") as r:
            get_pip.write_bytes(r.read())
    r = run([sys.executable, str(get_pip), "--break-system-packages", "--quiet"])
    if r.returncode != 0:
        die(f"pip bootstrap failed:\n{r.stderr}")
    ok("pip bootstrapped")


def pip_install(specs: list[str]) -> None:
    step("Installing Python packages")
    r = run([sys.executable, "-m", "pip", "install",
             "--break-system-packages", "--quiet", "--upgrade", *specs])
    if r.returncode != 0:
        die(f"pip install failed:\n{r.stderr[:2000]}")
    for s in specs:
        ok(s)


def ensure_deno() -> None:
    step("Ensuring deno (yt-dlp JS challenge solver)")
    if shutil.which("deno"):
        ok(f"deno: {subprocess.run(['deno','--version'], capture_output=True, text=True).stdout.splitlines()[0]}")
        return
    r = run([sys.executable, "-m", "pip", "install", "--break-system-packages", "--quiet", "deno>=0.1"])
    if r.returncode == 0 and shutil.which("deno"):
        ok("deno installed via pip")
    else:
        warn("deno not available — yt-dlp may fail on JS-challenge videos")


def env_report() -> None:
    step("Environment report")
    rows = [
        ("python", f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"),
        ("pip", "see pip --version"),
        ("node", run(["node", "--version"], timeout=5).stdout.strip() if shutil.which("node") else "MISSING"),
        ("npm",  run(["npm",  "--version"], timeout=5).stdout.strip() if shutil.which("npm") else "MISSING"),
        ("deno", run(["deno", "--version"], timeout=5).stdout.splitlines()[0] if shutil.which("deno") else "MISSING"),
        ("ffmpeg", run(["ffmpeg", "-version"], timeout=5).stdout.splitlines()[0] if shutil.which("ffmpeg") else "MISSING (optional)"),
    ]
    for k, v in rows:
        print(f"  {k:<8} {v}")
    # SSL workaround
    os.environ["PYTHONHTTPSVERIFY"] = "0"
    os.environ["SSL_CERT_FILE"] = ""
    os.environ["CURL_CA_BUNDLE"] = ""
    print(f"  {'ssl':<8} PYTHONHTTPSVERIFY=0 (sandbox self-signed chain workaround)")


def verify_imports() -> None:
    step("Verifying imports")
    mods = [
        "yt_dlp",
        "youtube_transcript_api",
        "pytubefix",
        "mcp",
        "mcp.server.fastmcp",
        "requests",
        "defusedxml",
    ]
    missing = []
    for m in mods:
        try:
            __import__(m)
            print(f"  ok  {m}")
        except Exception as e:
            missing.append(m)
            print(f"  !!  {m}: {e}")
    if missing:
        die(f"Missing modules: {missing}")


def main() -> None:
    print("YouTube library eval — environment setup")
    print("=" * 50)
    ensure_pip()
    pip_install(REQUIRED)
    ensure_deno()
    env_report()
    verify_imports()
    print("\n\033[1;32mEnvironment ready.\033[0m")
    print("Next: cd repos && python3 eval_aggressive.py")


if __name__ == "__main__":
    main()
