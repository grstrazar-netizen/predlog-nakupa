#!/bin/sh
set -eu

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js ni namescen. Odpiram stran za prenos Node.js LTS."
  open "https://nodejs.org/en/download"
  echo "Po namestitvi Node.js ponovno zazeni to datoteko."
  exit 1
fi

node server.mjs --dist &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

sleep 1
open "http://127.0.0.1:4173/"
wait "$server_pid"
