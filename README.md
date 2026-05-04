# oide

> oide (/oh-ee-day/) — Japanese for "come over"

GitHub Action that pulls files listed in your `Oidefile` from a source repository.

Common use case: a template repository owns shared files (license, security policy, CI configs, ...), and consumer repositories pull updates from it on a schedule.

## Usage

Add an `Oidefile` at your repo root listing the files to pull:

```
LICENSE
SECURITY.md
```

Example workflow at `.github/workflows/oide.yml`:

```yaml
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - .github/workflows/oide.yml

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
      - name: Open or update PR
```

oide writes pulled files into the workspace; opening a PR is a separate step.

## Inputs

| Input | Required | Description |
|---|---|---|
| `source` | yes | Source repo as `org/repo@ref`. `ref` can be a tag, branch, or commit SHA. Source must currently be public. |

## Oidefile

A plain-text manifest at your repo root. One file path per line, relative to the repo root:

```
LICENSE
SECURITY.md
```

## How it works

1. Parse `source` into `repo` and `ref`.
2. **Self-skip**: if `github.repository == repo`, exit no-op. Keeps the action from acting on the source repo itself when the workflow file happens to live there too.
3. Read the caller's `Oidefile`.
4. For each listed file present in source's git tree, copy it into the workspace. Files absent from source are skipped.

## Tip: source-managed manifest

Listing `Oidefile` itself in your `Oidefile` lets the source own the manifest going forward:

```
LICENSE
Oidefile
SECURITY.md
```

When `Oidefile` is self-listed, oide fetches the source's `Oidefile` first and re-reads it before pulling the other files. Adding a line in source's `Oidefile` then propagates to every consumer in a single run. Omit `Oidefile` from the manifest to let each consumer pin its own subset.

## Tip: Renovate integration

Declare the source ref as an env var with a Renovate annotation, then reference it from the action input:

```yaml
env:
  # renovate: datasource=github-tags depName=org/template-repo
  TEMPLATE_VERSION: v1.0.0

jobs:
  pull:
    ...
    steps:
      - uses: iwamot/oide@...
        with:
          source: org/template-repo@${{ env.TEMPLATE_VERSION }}
```

Renovate's [`customManagers:githubActionsVersions`](https://docs.renovatebot.com/presets-customManagers/#custommanagersgithubactionsversions) preset (included in `config:best-practices`) picks this up and opens PRs when new tags are published.

## Out of scope

- PR creation
- Deletion of files removed from source's `Oidefile`

## License

MIT
