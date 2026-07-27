# Oide

[![Marketplace](https://img.shields.io/github/v/release/iwamot/oide?logo=github&label=Marketplace)](https://github.com/marketplace/actions/oide-by-iwamot)

> Oide (/oh-ee-day/) — Japanese for "come over"

GitHub Action that pulls files listed in your `Oidefile` from source repositories.

Common use case: a template repository owns shared files (license, security policy, CI configs, ...), and consumer repositories pull updates from it on a schedule.

## Usage

Add an `Oidefile` listing the files to pull:

```
LICENSE
SECURITY.md
```

Example workflow at `.github/workflows/oide.yml`:

```yaml
on:
  push:
    branches: [main]
    paths:
      - .github/workflows/oide.yml
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
          sources: org/template-repo@v1.0.0
      - name: Open or update PR
```

Oide writes pulled files into the workspace; pushing them and opening a PR are separate steps (and the permissions above exist for those steps, not for Oide itself).

## Inputs

| Input | Required | Description |
|---|---|---|
| `sources` | yes | One source per line, as `org/repo@ref` — `ref` can be a tag, branch, or commit SHA — optionally followed by the Oidefile to read for it. |
| `token`  | no  | Token with `contents:read` access to the source repo. Required only for private source repositories. |

## Oidefile

A plain-text manifest listing one file path per line, relative to the repo root:

```
LICENSE
SECURITY.md
```

Unless a source names one, Oide looks for it in these locations and uses the first match:

1. `Oidefile`
2. `.github/Oidefile`

## How it works

For each source, in the order listed:

1. **Self-skip**: if `github.repository == repo`, skip that source. Keeps the action from acting on the source repo itself when the workflow file happens to live there too.
2. Read the source's Oidefile — the one it named, or the first candidate present.
3. For each listed file, read it from source at `ref` via the GitHub Contents API and write it into the workspace. Files absent from source are skipped, as are files over the API's 1 MB inline limit.

## Private source repositories

To pull from a private source, pass a token with `contents:read` access on the source:

```yaml
- uses: iwamot/oide@...
  with:
    sources: org/private-template@v1.0.0
    token: ${{ secrets.OIDE_TOKEN }}
```

For cross-repository access, `secrets.GITHUB_TOKEN` is not sufficient (it only grants access to the calling repository). Use a fine-grained Personal Access Token, or an App installation token via `actions/create-github-app-token`.

## Tip: source-managed manifest

Listing your Oidefile's own path in it lets the source own the manifest going forward:

```
LICENSE
Oidefile
SECURITY.md
```

When the Oidefile is self-listed, Oide fetches the source's copy first and re-reads it before pulling the other files, so additions on the source side propagate to every consumer in a single run. Omit it to let each consumer pin its own subset.

## Tip: several sources

A source may name the Oidefile to read for it, which is what lets one repo pull from more than one:

```yaml
- uses: iwamot/oide@...
  with:
    sources: |
      org/template-repo@v1.0.0
      org/other-repo@v2.0.0 .github/Oidefile.other
```

Give each source its own manifest rather than sharing one. Two sources that both hold a listed path would otherwise both write it, and which one wins would come down to their order.

A line starting with `#` is ignored, so a note can sit next to the pin it belongs to — a block scalar takes `#` as content rather than as a YAML comment:

```yaml
    sources: |
      # renovate: datasource=github-tags depName=org/template-repo
      org/template-repo@v1.0.0
```

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
