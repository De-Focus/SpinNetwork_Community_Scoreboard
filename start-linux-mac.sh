#!/bin/sh
set -eu
cd "$(dirname "$0")"
export BBX_OPEN_BROWSER=1
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 22+ required for the Linux/macOS source edition.' >&2
  exit 1
fi
exec node server.js
