#!/bin/sh
set -e

# Download act binary if not present (ubuntu:22.04 image does not include it)
if [ ! -x /usr/local/bin/act ]; then
    echo "Downloading nektos/act binary ..."
    apt-get update -qq && apt-get install -qq -y curl tar gzip >/dev/null 2>&1 || true
    curl -sL -o /tmp/act.tar.gz https://github.com/nektos/act/releases/download/v0.2.89/act_Linux_x86_64.tar.gz
    tar -xzf /tmp/act.tar.gz -C /usr/local/bin act
    chmod +x /usr/local/bin/act
    rm -f /tmp/act.tar.gz
fi

EVENT="pull_request"
WORKFLOW=".github/workflows/ci.yml"

if [ -n "$1" ]; then
  case "$1" in
    test)
      EVENT="pull_request"
      WORKFLOW=".github/workflows/ci.yml"
      ;;
    push|pull_request|schedule|workflow_dispatch)
      EVENT="$1"
      ;;
  esac
fi

exec act -P ubuntu-latest=nektos/act-environments-ubuntu:18.04 -W "$WORKFLOW" "$EVENT"
