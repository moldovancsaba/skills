# GDS Team Request: Close Remaining 100% GDS-Only Gaps

Date: 2026-06-07
Project: `checklist`
Current GDS package: `@doneisbetter/gds@3.4.3`

## Context

`checklist` now passes the local GDS gates:

- `npm run audit:gds-boundary`
- `npm run audit:semantic`
- `npm run test:gds-style-contract`

Local hardening also removed raw `var(--mantine-color-...)` use from feature code and tightened audits so feature files cannot import `Card`, `Paper`, `Text`, or `Title` from the compatibility primitive barrel.

The remaining gaps are upstream product/API gaps. The app still needs compatibility modules such as `src/components/gds/primitives.ts`, but that file currently has to re-export broad Mantine APIs. That keeps migration stable, but it is not a strong long-term 100% GDS-only contract.

## Requests

### 1. Replace broad compatibility barrels with package-native primitive exports

Current local compatibility layer:

```ts
export * from "@mantine/core";
```

Request:

- Publish named, package-native GDS primitive exports for the approved component set.
- Make raw Mantine implementation details inaccessible to feature code.
- Include typed exports for existing high-use primitives: `Box`, `Stack`, `Group`, `SimpleGrid`, `Button`, `ActionIcon`, `Badge`, `ThemeIcon`, `Table`, `Select`, `TextInput`, `Textarea`, `Switch`, `Slider`, `Progress`, `Modal`, `Tooltip`, `Loader`, `Center`, `Container`, `Anchor`, `ScrollArea`, `Tabs`, `Accordion`, and form controls.

Acceptance:

- Feature code can import approved primitives from `@doneisbetter/gds` directly.
- No app-local `export * from "@mantine/core"` compatibility barrel is needed.

### 2. Provide package-native typography roles

Checklist currently owns local typography wrappers in `src/components/ui/typography.tsx`.

Request:

- Add GDS typography role components for general product use: page title, section title, card title, body text, metadata text, label text, inline text, and markdown-safe inline emphasis.
- These should prevent local `Text size=...` and `Title order=...` ladders from reappearing.

Acceptance:

- Checklist can migrate local typography wrappers to package-native GDS exports without changing feature semantics.

### 3. Provide semantic chart primitives and palettes

Checklist uses Recharts through a local GDS boundary and now maps chart colors to semantic module tokens locally.

Request:

- Add GDS chart wrappers for common dashboard patterns: bar chart, line chart, stacked bar chart, tooltip, legend, axis, and responsive frame.
- Provide a semantic series palette API based on tone names, not Mantine hue names.
- Include default grid stroke, bar radius, animation defaults, empty/loading states, and accessible chart labels.

Acceptance:

- Feature code no longer imports Recharts wrappers from a local compatibility module.
- Chart color selection is `tone` or `seriesTone`, not raw color strings.

### 4. Provide sanctioned layout/style utilities for common inline styles

Remaining local inline styles are mostly layout mechanics, not visual design, but they still weaken the rule.

Request GDS utilities/components for:

- scroll and overflow containers
- fixed/floating action placement
- table numeric alignment
- visually hidden captions and labels
- clipped/truncated flex children
- z-index layering inside cards
- monospace input/textarea variants
- semantic inset/list item sections

Acceptance:

- Feature code can remove most `style={{ ... }}` and `styles={{ ... }}` usage without losing layout correctness.

### 5. Provide semantic icon color helpers

Checklist currently uses semantic CSS variables for icon strokes after removing raw Mantine palette references.

Request:

- Add a GDS helper or icon wrapper that accepts `tone`.
- Return accessible color and contrast defaults for inline SVG icons, status icons, and decorative icons.

Acceptance:

- Feature code does not pass CSS color strings to icons.

## Current Local Guardrails

Checklist now enforces:

- no direct Mantine, Tabler, Recharts, or drag/drop imports outside `src/components/gds/*`
- no feature-level `Card`, `Paper`, `Text`, or `Title` imports from the local primitive barrel
- no raw `var(--mantine-color-...)` tokens outside theme sources
- `UnifiedCard` remains the only approved feature-level product card API

## Priority

Highest priority:

1. package-native primitive exports replacing the broad Mantine barrel
2. package-native typography roles
3. semantic chart wrappers and series palette

These three unlock most of the remaining checklist migration without local policy exceptions.
