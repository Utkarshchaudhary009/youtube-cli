#!/usr/bin/env bash
# Setup script for the YouTube library evaluation harness.
# Idempotent — safe to re-run. Re-runs recover the environment after a sandbox reset.
#
# What it installs (as root, into the system Python):
#   - pip (via get-pip.py if missing)
#   - Python deps: yt-dlp, youtube-transcript-api, pytubefix, mcp[cli], requests, defusedxml
#   - deno (via pip — yt-dlp's challenge solver needs a JS runtime)
#
# What it does NOT install (sandbox blocks them):
#   - ffmpeg     -> optional; only needed for post-processing / format conversion
#   - system pip -> get-pip.py is used instead
#
# Usage:  bash repos/setup_env.sh
set -euo pipefail

PY="${PYTHON:-python3}"
PIP="$PY -m pip"

step() { printf '\n\033[1;34m[setup]\033[0m %s\n' "$*"; }
ok()   { printf '  \033[1;32m[ok]\033[0m %s\n' "$*"; }
warn() { printf '  \033[1;33m[warn]\033[0m %s\n' "$*"; }
die()  { printf '  \033[1;31m[fatal]\033[0m %s\n' "$*" >&2; exit 1; }

# --- 1. Locate Python --------------------------------------------------
step "Locating Python"
if ! command -v "$PY" >/dev/null 2>&1; then
  die "Python interpreter '$PY' not found on PATH"
fi
PY_VERSION="$($PY -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
ok "Python $PY_VERSION at $(command -v $PY)"

# --- 2. Ensure pip ------------------------------------------------------
step "Ensuring pip"
if ! $PY -m pip --version >/dev/null 2>&1; then
  warn "pip missing — bootstrapping via get-pip.py"
  GET_PIP="/tmp/get-pip.py"
  if [ ! -f "$GET_PIP" ]; then
    curl -fsSL https://bootstrap.pypa.io/get-pip.py -o "$GET_PIP" \
      || die "could not download get-pip.py"
  fi
  $PY "$GET_PIP" --break-system-packages --quiet
fi
$PIP --version
ok "pip ready"

# --- 3. Install Python deps -------------------------------------------
step "Installing Python dependencies"
# Older mcp 0.9 has no FastMCP; pin 1.x for youtube-mcp-server.
$PIP install --break-system-packages --quiet --upgrade \
  pip \
  "yt-dlp" \
  "youtube-transcript-api" \
  "pytubefix" \
  "mcp>=1.0,<1.3" \
  "requests" \
  "defusedxml"
ok "Python packages installed"

# --- 4. deno (JS runtime for yt-dlp challenge solver) -----------------
step "Ensuring deno (for yt-dlp JS challenge solving)"
if ! command -v deno >/dev/null 2>&1; then
  $PIP install --break-system-packages --quiet "deno>=0.1" || warn "deno install failed"
fi
if command -v deno >/dev/null 2>&1; then
  ok "deno: $(deno --version | head -1)"
else
  warn "deno not available — yt-dlp may fail on SABR/JS-challenge videos"
fi

# --- 5. node (for YouTube.js npm test) --------------------------------
step "Ensuring node + npm"
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  ok "node $(node --version), npm $(npm --version)"
else
  warn "node/npm missing — YouTube.js / yt-dlp-mcp npm tests will skip"
fi

# --- 6. ffmpeg (optional) ----------------------------------------------
step "Checking ffmpeg (optional, for format conversion)"
if command -v ffmpeg >/dev/null 2>&1; then
  ok "ffmpeg: $(ffmpeg -version 2>/dev/null | head -1)"
else
  warn "ffmpeg missing — yt-dlp post-processing tests will be limited"
fi

# --- 7. SSL sanity check (sandbox has self-signed chain) --------------
step "Configuring SSL workaround for sandbox"
export PYTHONHTTPSVERIFY=0
export SSL_CERT_FILE=
export CURL_CA_BUNDLE=
ok "PYTHONHTTPSVERIFY=0 (sandbox self-signed chain workaround)"

# --- 8. Verification ----------------------------------------------------
step "Verifying all imports"
$PY - <<'PYEOF'
import importlib, sys
modules = ["yt_dlp", "youtube_transcript_api", "pytubefix", "mcp", "mcp.server.fastmcp", "requests", "defusedxml"]
missing = []
for m in modules:
    try:
        importlib.import_module(m)
        print(f"  ok  {m}")
    except Exception as e:
        missing.append(m)
        print(f"  !!  {m}: {e}")
if missing:
    print(f"FAIL: missing {missing}", file=sys.stderr)
    sys.exit(1)
print("All modules imported successfully.")
PYEOF

step "Done. Environment ready."
echo "Run an eval with:  cd repos && python3 eval_aggressive.py"
