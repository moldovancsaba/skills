# Terminology Audit

`check` uses canonical product language so engineers, operators, and future agents do not accidentally rebuild old assumptions.

Run:

```bash
npm run audit:terminology
```

JSON output:

```bash
npm run audit:terminology -- --json
```

Targeted scan:

```bash
npm run audit:terminology -- --path=docs --path=src
```

## Canonical product terms

- `check`: full platform
- `Unit`: one company, organization, team, or intelligence operation
- `Block`: optional product capability enabled inside a Unit
- `Module`: reusable functional area used by Blocks
- `Card`: atomic object managed by Modules and Blocks
- `Miniapp`: public-facing app powered by a Unit
- `Webapp`: B2B UI for operating `check`
- `Local`: local AI service

## Legacy aliases

Some implementation aliases are temporarily allowed when they name existing code, routes, or storage:

- `companyId`
- `webappProfile`
- legacy profile adapters
- existing route names that have not yet migrated

These aliases must not be used as product language for new UI, docs, or issue descriptions.

## Inline allow

If a line intentionally contains legacy language for compatibility documentation, add:

```text
terminology-audit: allow
```

Use this sparingly and only when the preferred canonical term would make the implementation detail less clear.

## Failure policy

Error-level findings should block new foundation work.
Warning-level findings should be fixed unless they are clearly documenting a legacy compatibility boundary.
