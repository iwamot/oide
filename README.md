# oide

> oide (/oh-ee-day/) — Japanese for "come over"

GitHub Action that pulls files listed in your `Oidefile` from a source repository.

Common use case: a template repository owns shared files (license, security policy, CI configs, ...), and consumer repositories pull updates from it on a schedule.

## Usage

Add an `Oidefile` at your repo root listing the files to pull:

```
SECURITY.md
LICENSE
```

Example workflow at `.github/workflows/oide.yml`:

```yaml
on:
  schedule:
    - cron: '0 0 * * 1'
  workflow_dispatch:

jobs:
  pull:
    runs-on: ubuntu-latest
    permissions:
      contents: write       # to push the branch
      pull-requests: write  # to open the PR
    steps:
      - uses: actions/checkout@...
      - uses: iwamot/oide@...
        with:
          source: org/template-repo@v1.0.0
      - uses: peter-evans/create-pull-request@...
        with:
          branch: oide/pull
          title: 'chore: pull files via oide'
          commit-message: 'chore: pull files via oide'
          body: 'Automated pull via [oide](https://github.com/iwamot/oide).'
```

oide writes pulled files into the workspace; opening a PR is a separate step.

## Inputs

| Input | Required | Description |
|---|---|---|
| `source` | yes | Source repo as `org/repo@ref`. `ref` can be a tag, branch, or commit SHA. Source must currently be public. |

## Oidefile

A plain-text manifest at your repo root. One file path per line, relative to the repo root:

```
SECURITY.md
LICENSE
```

## How it works

1. Parse `source` into `repo` and `ref`.
2. **Self-skip**: if `github.repository == repo`, exit no-op. Keeps the action from acting on the source repo itself when the workflow file happens to live there too.
3. Read the caller's `Oidefile`.
4. For each listed file present in source's git tree, copy it into the workspace. Files absent from source are skipped.

## Tip: source-managed manifest

Listing `Oidefile` itself in your `Oidefile` lets the source own the manifest going forward:

```
Oidefile
SECURITY.md
LICENSE
```

When `Oidefile` is self-listed, oide fetches the source's `Oidefile` first and re-reads it before pulling the other files. Adding a line in source's `Oidefile` then propagates to every consumer in a single run. Omit `Oidefile` from the manifest to let each consumer pin its own subset.

## Renovate integration

The `source: org/repo@ref` form is easy to keep current with Renovate `customManagers`:

```json
{
  "customManagers": [
    {
      "customType": "regex",
      "fileMatch": ["^\\.github/workflows/oide\\.yml$"],
      "matchStrings": [
        "source:\\s*(?<depName>[^@\\s]+)@(?<currentValue>[^\\s]+)"
      ],
      "datasourceTemplate": "github-tags"
    }
  ]
}
```

## Out of scope

- PR creation
- Deletion of files removed from source's `Oidefile`

## License

MIT
