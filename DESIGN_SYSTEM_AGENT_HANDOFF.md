# CHECKLIST Design System Agent Handoff

Use this document as the single copyable handoff for another agent that needs to refactor a separate project using the design principles, implementation patterns, and lessons learned from CHECKLIST.

This document is based on the implemented source of truth in:
- `src/components/providers.tsx`
- `src/app/globals.css`
- `src/lib/semantic-theme.ts`
- `scripts/semantic-audit.mjs`

It also notes where older design docs are now out of sync with the live system.

## 1. System Summary

CHECKLIST evolved into a semantic-token-driven Mantine UI system with these core decisions:

- One UI framework: Mantine is the rendering and component foundation.
- One token layer: global CSS variables define surfaces, text, borders, gradients, shadows, and semantic module tones.
- One semantic color model: UI colors are chosen by product meaning, not arbitrary hue names.
- One surface language: cards, sections, nav items, and modals all inherit the same tokenized surface treatment.
- One helper layer: semantic surfaces are consumed through shared helper functions rather than repeated inline glass recipes.
- One dark/light system: both modes have full token sets rather than ad hoc overrides.
- One anti-fragmentation rule: no parallel styling systems, no legacy color shortcuts, no “just this one component” exceptions.
- One state layer: success, warning, danger, info, and muted UI states should map through shared product semantics rather than generic library defaults.
- One motion rule: if the product disables motion globally, feature code should not keep local transition declarations around.

If another agent is refactoring a project based on this system, the biggest goal is not “copy the colors.” The goal is to reproduce the architecture:

- semantic intent first
- tokenized surfaces second
- component defaults third
- audits to prevent drift

## 2. Non-Negotiable Design Rules

These are the global rules that matter most.

### 2.1 One design system only

- Use one component system consistently.
- In CHECKLIST that system is Mantine.
- Do not mix in Tailwind utility styling, shadcn component fragments, ad hoc CSS islands, or separate theme concepts for special pages.
- Do not allow old visual paradigms to coexist with new ones for long periods.

Why we learned this:
- Parallel systems create visual drift, duplicated abstractions, inconsistent spacing/radius/shadow behavior, and much harder refactors later.

### 2.2 Semantic colors only

- Colors should represent product meaning, not raw hue choice.
- In CHECKLIST, the approved semantic tones are:
  - `ingress`
  - `synthesis`
  - `knowmore`
  - `strategy`
  - `checklist`
  - `tactical`
  - `review`
  - `neutral`
- A component should be colored according to its role in the product, not because “blue looks nice here.”

Why we learned this:
- Hue-first systems are hard to scale because teams start using the same color for unrelated meaning.
- Semantic tones make navigation, scanning, and future refactors much easier.

### 2.3 Tokenize surfaces, not just accents

- Do not define only a primary brand color and then improvise all card/background states.
- Every semantic tone should define:
  - primary color
  - base surface
  - hover surface
  - glow
  - border
  - rgb triplet for alpha effects
- All elevated UI should be constructed from those tokens.

Why we learned this:
- Teams often theme buttons and forget surfaces.
- Most of the visual coherence in a product actually comes from surface treatment, not accent colors.

### 2.4 Light and dark mode must be fully designed

- Do not invert light mode mechanically.
- Define complete token sets for both light and dark mode.
- Preserve semantic identity across modes while changing contrast, depth, and glow appropriately.

Why we learned this:
- Automatic inversion produces muddy surfaces, weak borders, and inconsistent emphasis.

### 2.5 Default component behavior must be centralized

- Buttons, cards, badges, titles, inputs, nav links, and modals should be standardized in the theme layer.
- Do not rely on every feature developer to remember the right radius, letter spacing, padding, or border treatment.

Why we learned this:
- Teams create inconsistency fastest through repeated “small” local component overrides.

### 2.5a State semantics must be centralized

- Error, warning, success, info, and muted states should resolve through a shared helper layer.
- Do not let random components choose `red`, `green`, or `orange` independently.

Why we learned this:
- Surface semantics become clean first; state semantics are usually where inconsistency survives the longest.

### 2.6 Add drift-prevention automation

- Once the new system is in place, enforce it with a repo audit.
- CHECKLIST includes an automated semantic audit that blocks known anti-patterns.

Why we learned this:
- Refactors fail long-term unless you codify what is forbidden.

## 3. Semantic Tone Model

This is the core semantic layer used across the product.

### 3.1 Tone meanings

- `ingress`: intake, source acquisition, entry points, incoming information
- `synthesis`: clustering, understanding, summarization, topic intelligence
- `knowmore`: knowledge enrichment, supporting context, deeper evidence
- `strategy`: planning, goals, direction, prioritization
- `checklist`: execution planning, organized action structures
- `tactical`: active operations, implementation, execution boards
- `review`: alerts, audits, decisions, manual review loops
- `neutral`: fallback, structural UI, non-primary content

### 3.2 Alias mapping

When migrating another project, normalize legacy colors into semantic names instead of preserving raw hue names forever.

CHECKLIST alias behavior:

- `brand`, `blue` -> `ingress`
- `indigo` -> `synthesis`
- `teal`, `green`, `knowledge` -> `knowmore`
- `violet`, `purple` -> `strategy`
- `cyan`, `execution` -> `checklist`
- `orange`, `amber` -> `review`
- `gray`, `dark`, `red`, `yellow` -> `neutral`
- unknown values -> `neutral` with a warning

Design lesson:
- Alias old terms for migration speed, but converge usage toward semantic names over time.

## 4. Canonical Global Tokens

These are the implemented global tokens in CHECKLIST.

### 4.1 Light mode foundation

```text
--app-bg: #f4f7fb
--sidebar-bg: #eef3f8
--surface-base: #ffffff
--surface-elevated: #f8fbff
--border-primary: rgba(15, 23, 42, 0.12)
--text-primary: #142033
--text-secondary: #4f6078
--text-muted: #72839a
--overlay-color: rgba(228, 236, 248, 0.82)
--surface-gradient-top: rgba(255, 255, 255, 0.88)
--surface-gradient-bottom: rgba(255, 255, 255, 0.58)
--surface-hover-top: rgba(255, 255, 255, 0.94)
--surface-hover-bottom: rgba(255, 255, 255, 0.72)
--surface-shadow-elevated: 0 14px 32px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.7)
--surface-shadow-flat: 0 1px 0 rgba(255, 255, 255, 0.8) inset
--surface-icon-border: rgba(15, 23, 42, 0.08)
--surface-icon-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65)
--surface-section-border: rgba(15, 23, 42, 0.08)
--nav-company-label: #9a6700
--nav-company-description: #b47c14
--nav-link-active: var(--text-primary)
--nav-link-inactive: #5d6f89
```

### 4.2 Dark mode foundation

```text
--app-bg: #0b0f14
--sidebar-bg: #0f141b
--surface-base: #161c24
--surface-elevated: #1b2430
--border-primary: #2a3441
--text-primary: #e6edf3
--text-secondary: #9aa4b2
--text-muted: #6b7280
--overlay-color: rgba(11, 15, 20, 0.92)
--surface-gradient-top: rgba(255, 255, 255, 0.03)
--surface-gradient-bottom: rgba(255, 255, 255, 0.01)
--surface-hover-top: rgba(255, 255, 255, 0.04)
--surface-hover-bottom: rgba(255, 255, 255, 0.015)
--surface-shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.03)
--surface-shadow-flat: 0 1px 0 rgba(255, 255, 255, 0.03) inset
--surface-icon-border: rgba(255, 255, 255, 0.06)
--surface-icon-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04)
--surface-section-border: rgba(255, 255, 255, 0.05)
--nav-company-label: #fbc277
--nav-company-description: #e8c89a
--nav-link-active: #e6edf3
--nav-link-inactive: #d2d9e1
```

### 4.3 Semantic tone tokens

#### Light mode tones

```text
ingress
  color: #2563eb
  surface: #e8f1ff
  hover-surface: #dbeafe
  glow: rgba(37, 99, 235, 0.12)
  border: rgba(37, 99, 235, 0.18)
  rgb: 37, 99, 235

synthesis
  color: #4f46e5
  surface: #ede9fe
  hover-surface: #e2ddff
  glow: rgba(79, 70, 229, 0.12)
  border: rgba(79, 70, 229, 0.18)
  rgb: 79, 70, 229

knowmore
  color: #059669
  surface: #e5fbf2
  hover-surface: #d5f7ea
  glow: rgba(5, 150, 105, 0.12)
  border: rgba(5, 150, 105, 0.18)
  rgb: 5, 150, 105

strategy
  color: #7c3aed
  surface: #f2eaff
  hover-surface: #e9dcff
  glow: rgba(124, 58, 237, 0.12)
  border: rgba(124, 58, 237, 0.18)
  rgb: 124, 58, 237

checklist
  color: #0284c7
  surface: #e6f6ff
  hover-surface: #d6f0ff
  glow: rgba(2, 132, 199, 0.12)
  border: rgba(2, 132, 199, 0.18)
  rgb: 2, 132, 199

tactical
  color: #0f766e
  surface: #e1fbf8
  hover-surface: #d0f5f0
  glow: rgba(15, 118, 110, 0.12)
  border: rgba(15, 118, 110, 0.18)
  rgb: 15, 118, 110

review
  color: #d97706
  surface: #fff3df
  hover-surface: #ffe8c1
  glow: rgba(217, 119, 6, 0.12)
  border: rgba(217, 119, 6, 0.18)
  rgb: 217, 119, 6

neutral
  color: #64748b
  surface: #f4f7fb
  hover-surface: #edf2f8
  glow: rgba(100, 116, 139, 0.08)
  border: rgba(100, 116, 139, 0.14)
  rgb: 100, 116, 139
```

#### Dark mode tones

```text
ingress
  color: #3b82f6
  surface: #10243f
  hover-surface: #143154
  glow: rgba(59, 130, 246, 0.18)
  border: rgba(59, 130, 246, 0.22)
  rgb: 59, 130, 246

synthesis
  color: #6366f1
  surface: #1a1d4a
  hover-surface: #232864
  glow: rgba(99, 102, 241, 0.18)
  border: rgba(99, 102, 241, 0.22)
  rgb: 99, 102, 241

knowmore
  color: #10b981
  surface: #0f2d27
  hover-surface: #153d35
  glow: rgba(16, 185, 129, 0.18)
  border: rgba(16, 185, 129, 0.22)
  rgb: 16, 185, 129

strategy
  color: #8b5cf6
  surface: #24163f
  hover-surface: #312058
  glow: rgba(139, 92, 246, 0.18)
  border: rgba(139, 92, 246, 0.22)
  rgb: 139, 92, 246

checklist
  color: #0ea5e9
  surface: #102838
  hover-surface: #16384c
  glow: rgba(14, 165, 233, 0.18)
  border: rgba(14, 165, 233, 0.22)
  rgb: 14, 165, 233

tactical
  color: #14b8a6
  surface: #102d2a
  hover-surface: #17403c
  glow: rgba(20, 184, 166, 0.18)
  border: rgba(20, 184, 166, 0.22)
  rgb: 20, 184, 166

review
  color: #f59e0b
  surface: #3b2a12
  hover-surface: #513a18
  glow: rgba(245, 158, 11, 0.18)
  border: rgba(245, 158, 11, 0.22)
  rgb: 245, 158, 11

neutral
  color: #9aa4b2
  surface: #161c24
  hover-surface: #1b2430
  glow: rgba(154, 164, 178, 0.12)
  border: rgba(154, 164, 178, 0.18)
  rgb: 154, 164, 178
```

## 5. Component Contract

This is the component-level default behavior that makes the system feel consistent.

### 5.1 Typography

- Body font: `Inter, ui-sans-serif, system-ui, sans-serif`
- Monospace: `Monaco, Courier, monospace`
- Default text sizes:
  - `xs`: 12px
  - `sm`: 14px
  - `md`: 16px
  - `lg`: 18px
  - `xl`: 20px
- Heading sizes:
  - `h1`: 32px, line-height 1.1
  - `h2`: 24px, line-height 1.2
  - `h3`: 20px, line-height 1.25
  - `h4`: 18px, line-height 1.4
- Heading weight: 700
- Title tracking: `-0.03em`
- Nav labels and badges use slightly tightened tracking.

Design lesson:
- Tight tracking on headings gives a cleaner, more intentional control-room feel.
- Standard body sizes keep dashboards legible under density pressure.

### 5.2 Radius

- Default radius: `md`
- NavLink root: about 10px
- Button: `md`
- Badge: `sm`
- Card: `md`
- ThemeIcon: `sm`

Design lesson:
- Keep rounding restrained. Enough softness to feel modern, not so much that enterprise data surfaces start to feel toy-like.

### 5.3 Buttons

- Weight: 700
- Text transform: uppercase
- Letter spacing: 0.6
- Filled buttons use semantic tone color as the fill.
- Light buttons use tone surface plus tone border.
- Outline buttons use tone border plus tone text color.
- Buttons retain shared text color and drop shadow.

Design lesson:
- Uppercase and tighter systemized treatment helps action elements hold their own inside dense information layouts.

### 5.4 Cards

- Default radius: `md`
- Border enabled by default
- Default padding: `xl`
- Background: `--surface-base`
- Border: `--border-primary`
- Shadow: `--surface-shadow-elevated`

For semantically themed cards:
- background must include the global gradient plus the tone surface
- border must use the tone border
- hover states should use tone hover surface and glow

Design lesson:
- The card system should feel like one family, with semantic shifts as a tint, not an entirely different component per feature.

### 5.5 Inputs and forms

- Input background: `--surface-elevated`
- Input border: `--border-primary`
- Input text: `--text-primary`
- Labels:
  - weight 500
  - size `sm`
  - color `--text-secondary`
- Descriptions:
  - italic
  - `--text-muted`

Design lesson:
- Secondary copy should be consistently quieter than primary content without disappearing.

### 5.6 Modals

- Modal content uses elevated surface background
- Modal border uses primary border token
- Modal shadow is significantly stronger than normal cards

Design lesson:
- Overlays need clearer separation than cards or they collapse visually into the page.

### 5.7 Navigation

- Sidebar background uses its own token
- Active state should use semantic tone gradient and a left border accent
- Inactive state uses dedicated nav text tokens

Design lesson:
- Navigation should communicate information architecture, not just selection state.

## 6. Surface Construction Rules

These matter more than most teams realize.

### 6.1 Base semantic surface

Use:

```text
background: linear-gradient(180deg, var(--surface-gradient-top), var(--surface-gradient-bottom)), tone.surface
border: 1px solid tone.border
box-shadow: var(--surface-shadow-elevated) or var(--surface-shadow-flat)
```

### 6.2 Hover semantic surface

Use:

```text
background: linear-gradient(180deg, var(--surface-hover-top), var(--surface-hover-bottom)), tone.hoverSurface
box-shadow: 0 0 0 1px rgba(tone.rgb, 0.24), 0 10px 24px tone.glow
```

### 6.2a Inset semantic surface

Use for filter trays, internal card panels, and compact embedded surfaces:

```text
background: linear-gradient(180deg, var(--surface-hover-top), var(--surface-hover-bottom)), tone.hoverSurface
border: 1px solid var(--surface-section-border)
box-shadow: var(--surface-shadow-flat)
```

### 6.2b Semantic callout surface

Use for annotations, notes, status callouts, and review strips:

```text
semantic inset surface
+ left border accent in the tone rgb/color
```

### 6.3 Sidebar active state

Use:

```text
background: linear-gradient(90deg, rgba(tone.rgb, 0.22), rgba(tone.rgb, 0.06))
border-left: 2px solid rgb(tone.rgb)
```

### 6.4 Sidebar hover state

Use:

```text
background: linear-gradient(90deg, rgba(tone.rgb, 0.12), rgba(tone.rgb, 0.03))
```

Design lesson:
- The difference between “looks generic” and “feels designed” often comes from how hover and active surfaces are constructed, not from which accent hex was chosen.

## 7. Anti-Patterns To Forbid

CHECKLIST uses an audit script to block old patterns. Another project should do the same.

### 7.1 Forbidden patterns

- `color="brand"`
- `c="brand"`
- `var(--mantine-color-brand...)`
- generic direct colors like:
  - `color="blue"`
  - `color="green"`
  - `color="orange"`
  - `color="violet"`
  - `color="cyan"`
  - `color="teal"`
  - `color="indigo"`
- `light-dark(...)`
- loaders that still use `color="brand"`
- raw dark palette references like `var(--mantine-color-dark-4)`
- undefined surface tokens like `var(--surface-subtle)`
- local translucent glass recipes like `rgba(255,255,255,0.03)` or `rgba(0,0,0,0.2)`
- raw danger/success/warning colors applied ad hoc
- local transition declarations when the system contract is no-motion
- local transition wrapper components that contradict the global motion policy

### 7.2 Why these are forbidden

- They bypass the semantic layer.
- They allow legacy vocabulary to survive indefinitely.
- They make refactors harder because intent is lost.
- They cause teams to style by habit instead of by product meaning.

## 8. Layout and Global Behavior Rules

- `box-sizing: border-box` globally
- `html, body` set to full height
- body background and text come from global tokens
- font smoothing enabled
- custom scrollbars are allowed but should stay subtle

One unusual but explicit CHECKLIST rule:

- animations, transitions, and smooth scrolling are globally disabled

Why this exists:
- The product favors deterministic, low-noise, dense information surfaces over decorative motion.

Migration note:
- Another product should decide whether to keep this. It is a deliberate product choice, not a universal law.

## 9. Migration Strategy For Another Project

If another agent is refactoring an existing app, use this order.

### Phase 1: Establish the foundation

- choose the single component system
- create root light/dark global tokens
- create semantic tone families
- centralize typography, radius, spacing, borders, shadows

### Phase 2: Build semantic helpers

- create a tone resolver
- create alias mappings for legacy color names
- create helper functions for:
  - semantic surfaces
  - semantic hover states
  - active nav states
  - tone-to-component-color resolution

### Phase 3: Standardize default components

- buttons
- cards
- badges
- text
- titles
- nav links
- inputs
- modals
- dividers

### Phase 4: Replace local styling

- convert raw color props to semantic tones
- replace hand-built cards with standardized surface helpers
- remove one-off border/shadow/radius logic
- migrate layouts onto approved primitives

### Phase 5: Lock the system

- add audit scripts
- fail CI on forbidden legacy patterns
- document the meaning of each semantic tone

## 10. What We Learned Building This System

These are the practical lessons that matter for a refactor.

- Most inconsistency does not come from typography. It comes from surfaces.
- Semantic naming is more important than brand naming inside product UI.
- Dark mode must be authored, not auto-generated.
- If component defaults are not centralized, every team member becomes a mini design system.
- Audit scripts are essential after a refactor.
- Alias mappings are useful for migration, but they should not become the permanent language of the system.
- “Brand color” is too vague for application architecture. Use product-role semantics instead.
- Draft marketing guidelines often drift away from live product behavior; treat code as the source of truth unless governance explicitly says otherwise.

## 11. Important Conflict In The Repo

There is an older marketing brand document that does not match the implemented product design tokens.

Conflict summary:
- Marketing doc says primary brand color is green (`#2E7D32`).
- Implemented product UI uses a semantic multi-tone system led by `ingress` blue as the primary theme color.
- Marketing doc is broad and draft-oriented.
- Product code is specific and enforced.

Instruction for another agent:
- If refactoring product UI, follow the implemented semantic token system, not the older marketing palette.
- If refactoring marketing pages or brand collateral, review whether the org wants to reconcile those systems first.

## 12. Copyable Refactor Prompt For Another Agent

Use the block below directly with another agent.

```md
Refactor this project to follow a CHECKLIST-style semantic design system with these rules:

1. Use one UI system only. Do not mix multiple styling paradigms.
2. Build a semantic color model, not a hue-first model. Approved semantic tones should cover roles like intake, synthesis, knowledge, strategy, execution, review, and neutral structure.
3. Define full token families for both light and dark mode:
   - app background
   - sidebar background
   - surface base
   - surface elevated
   - primary border
   - primary/secondary/muted text
   - overlay
   - surface gradients
   - hover gradients
   - elevated and flat shadows
   - icon border/shadow
4. For each semantic tone, define:
   - color
   - surface
   - hover surface
   - glow
   - border
   - rgb triplet
5. Centralize component defaults in the theme layer:
   - buttons
   - cards
   - badges
   - titles
   - text
   - nav links
   - inputs
   - modals
   - dividers
6. Standardize surfaces using helper functions so cards, panels, and navigation states all use the same construction logic.
7. Add legacy alias mapping temporarily, but normalize usage toward semantic names.
8. Replace all raw color usage with semantic intent.
9. Remove local one-off shadows, borders, radii, and background treatments where the theme should own them.
10. Add automated audits to block regressions such as raw brand colors, generic hue props, or legacy styling helpers.

Important design principles:
- Prefer semantic intent over visual habit.
- Make dark mode a first-class authored system.
- Keep the card family unified across features.
- Treat surfaces as the primary design language.
- Prevent drift with tooling, not just documentation.
```

## 13. Source Of Truth

If there is ever a conflict between prose docs and implementation, treat these as the final source of truth in CHECKLIST:

- `src/app/globals.css`
- `src/components/providers.tsx`
- `src/lib/semantic-theme.ts`
- `scripts/semantic-audit.mjs`
