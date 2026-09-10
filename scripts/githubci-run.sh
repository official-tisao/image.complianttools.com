#!/bin/sh
# Tools and fixtures belong in Dockerfile.githubci, never in this entrypoint.
set -eu
exec python3 /opt/githubci/runner.py "$@"
