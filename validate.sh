#!/bin/bash
set -e

# mise
eval "$(mise activate bash)"
mise fmt
mise install

# Run shared lint tasks
mise run gha-lint
mise run shell-lint

# Check for uncommitted changes
git diff --exit-code
