# Checklist Design System
**v0.15.0: Hardened Mantine-Only Architecture**

Unified component patterns for a premium, production-ready strategic intelligence interface.

## Core Principle: Mantine-Only Mandate

**CHECKLIST** enforces a strict Mantine-only architecture.
1. **No Ad-hoc Utility Classes**: All layout and styling must be handled via Mantine primitives (`Stack`, `Group`, `Grid`, `Box`, `Paper`, `Card`).
2. **Design Tokens Only**: Use only the hardened design tokens for colors, shadows, and spacing. 
3. **Architectural Purity**: No legacy Tailwind, shadcn, Radix, or parallel UI-system fragments may remain in the product UI.

## Premium Visual Language (Hardened)

- **Typography**: Uses **Inter** for all UI elements, emphasizing high contrast and tight tracking (`-0.5px` for headings).
- **Glassmorphism**: Primary surfaces use `backdropFilter: 'blur(10px)'` with low-opacity backgrounds (`rgba(255, 255, 255, 0.02)`) and `1px` borders for a premium, high-yield aesthetic.
- **Vibrant Gradients**: Leveraging Mantine's `gradient` variant for `LinkCard`, `MetricCard`, and primary buttons to ensure visual excellence.
- **Layers**: 
  - **Data Ingress**: `blue`
  - **Topic Synthesis**: `indigo`
  - **Knowmore**: `teal`
  - **Strategic Goals**: `violet`
  - **Checklist**: `blue`
  - **Tactical Board**: `cyan`
  - **Alerts/Review**: `orange`

## Intelligence Clarity (Metadata Filtering)

End-user displays must be purged of technical implementation details.
- **Filtering Utility**: Wrap all user-facing text (titles, descriptions, labels) in `stripTechnicalMetadata()` from `@/lib/ui-utils`.
- **Constraint**: `[TRACE:...]` and `[TOPIC_ID:...]` markers are strictly for internal debugging and must never be visible to the end user.

## Core Layout Components (Hardened)

### `PageShell`
The root container for all pages. Handles viewport-aware scaling and consistent vertical spacing.
- **Mandatory Usage**: Every primary intelligence route must be wrapped in a `PageShell`.

### `UnifiedGrid`
The standard responsive layout engine for strategic and tactical layers.
- **Desktop**: 3-column grid.
- **Mobile**: 1-column stack.

### `RouteCardGrid`
The standard responsive layout engine for the six core intelligence route cards.
- **Desktop**: 6-column grid.
- **Tablet**: 2-column grid.
- **Mobile**: 1-column stack.
- **Usage**: Company overview and Operation Unit dashboard navigation strips must use `RouteCardGrid` so the six core layers share one global layout contract.

### `MetricCard`
A high-visibility data surface re-engineered with glassmorphism and background blurs.
- **Usage**: Core dashboard metrics and strategic KPIs.

### `LinkCard`
Premium navigation unit featuring gradients and micro-animations.
- **Usage**: Main dashboard routing and layer-to-layer transitions.

## Unified Card Family

Import from `@/components/ui/unified-card` for all first-class objects:
- `UnifiedCard` (Root)
- `UnifiedCardHeader` (Metadata/Title)
- `UnifiedCardBody` (Description/Content)
- `UnifiedCardFooter` (Controls/Lineage)

## What NOT to Use

❌ **DO NOT** use Tailwind utility classes (e.g., `flex h-10 w-full rounded-md border...`).
❌ **DO NOT** use legacy `shadcn/ui` components.
❌ **DO NOT** hand-roll page shells or action links; use the design system primitives.

---

Last Updated: 2026-05-08 (v0.15.3 Mantine-only terminology sync)
