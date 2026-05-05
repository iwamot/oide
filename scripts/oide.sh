#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SOURCE:-}" ]]; then
  echo "::error::source input is required"
  exit 1
fi

if [[ "$SOURCE" != *"@"* ]]; then
  echo "::error::source must be in 'org/repo@ref' format, got: $SOURCE"
  exit 1
fi

source_repo="${SOURCE%@*}"
source_ref="${SOURCE#*@}"

if [[ -z "$source_repo" || -z "$source_ref" ]]; then
  echo "::error::source must be in 'org/repo@ref' format, got: $SOURCE"
  exit 1
fi

# Self-skip: when the workflow runs in the source repo itself (e.g. because
# it was distributed via Template Repository), there's nothing to pull.
# Skipped when GITHUB_REPOSITORY is unset (local invocation).
if [[ -n "${GITHUB_REPOSITORY:-}" && "$GITHUB_REPOSITORY" == "$source_repo" ]]; then
  echo "::notice::source equals github.repository ($source_repo); self-skip"
  exit 0
fi

workspace="${GITHUB_WORKSPACE:-$(pwd)}"

if [[ ! -f "$workspace/Oidefile" ]]; then
  echo "::error::Oidefile not found at $workspace/Oidefile"
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

echo "Fetching $source_repo @ $source_ref ..."
git -C "$tmpdir" init -q
git -C "$tmpdir" remote add origin "https://github.com/$source_repo.git"

if [[ -n "${TOKEN:-}" ]]; then
  auth=$(printf '%s' "x-access-token:${TOKEN}" | base64 -w0)
  git -C "$tmpdir" \
    -c "http.extraheader=Authorization: Basic ${auth}" \
    fetch --depth 1 -q origin -- "$source_ref"
else
  git -C "$tmpdir" fetch --depth 1 -q origin -- "$source_ref"
fi

git -C "$tmpdir" checkout -q FETCH_HEAD

read_oidefile() {
  awk 'NF { gsub(/^[[:space:]]+|[[:space:]]+$/, ""); print }' "$1"
}

mapfile -t list_initial < <(read_oidefile "$workspace/Oidefile")

oidefile_self_listed=false
for entry in "${list_initial[@]}"; do
  if [[ "$entry" == "Oidefile" ]]; then
    oidefile_self_listed=true
    break
  fi
done

pulled=0
skipped=0
oidefile_pulled=false

# Self-listing: pull source's Oidefile first and re-read for an authoritative
# list. This lets file additions on the source side propagate in one run.
if [[ "$oidefile_self_listed" == "true" && -f "$tmpdir/Oidefile" ]]; then
  cp "$tmpdir/Oidefile" "$workspace/Oidefile"
  echo "  pulled: Oidefile"
  pulled=$((pulled + 1))
  oidefile_pulled=true
  mapfile -t list_authoritative < <(read_oidefile "$workspace/Oidefile")
else
  list_authoritative=("${list_initial[@]}")
fi

for entry in "${list_authoritative[@]}"; do
  if [[ "$entry" == "Oidefile" && "$oidefile_pulled" == "true" ]]; then
    continue
  fi

  # Reject paths that escape the workspace. The git-tree existence check
  # below would also catch these (git refuses to track such paths), but a
  # belt-and-suspenders check keeps cp/mkdir safe.
  case "$entry" in
  /* | .. | ../* | */.. | */../*)
    echo "::warning::invalid path, skipping: $entry"
    skipped=$((skipped + 1))
    continue
    ;;
  esac

  if ! git -C "$tmpdir" cat-file -e "FETCH_HEAD:$entry" 2>/dev/null; then
    echo "::warning::not in source tree, skipping: $entry"
    skipped=$((skipped + 1))
    continue
  fi

  mkdir -p "$workspace/$(dirname "$entry")"
  cp "$tmpdir/$entry" "$workspace/$entry"
  echo "  pulled: $entry"
  pulled=$((pulled + 1))
done

echo "Done. pulled=$pulled, skipped=$skipped"
