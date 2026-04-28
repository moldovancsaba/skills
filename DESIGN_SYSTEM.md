# Checklist Design System

Unified component patterns for consistent, maintainable UI.

## Core Principle

**Always use unified design-system components** - Never hardcode page chrome, actions, or form styling directly in route files.

## Visual Language

- Typography uses **Inter** for all UI elements, emphasizing high contrast and tight tracking (2026 Clean Initiative).
- Design follows **Mantine v7** primitives: `Container`, `Grid`, `Stack`, `Group`, `Card`.
- Primary action emphasis uses `blue` (Mantine primary), while strategic layers use specific color tones (`amber` for Topics, `violet` for Checklist).
- High-intent objects use the **Unified 2026 Card Pattern**: `Card` with `withBorder`, `shadow="sm"`, and `radius="md"`.
- Hover effects are handled via Mantine's `UnstyledButton` or group-hover transitions for lift and clarity.

## Form Components

Import from `@/components/ui/form-fields`:

```tsx
import { FormInput, FormTextarea, FormSelect, FormCheckbox } from "@/components/ui/form-fields";
```

### FormInput

Use for: All text input fields

```tsx
<FormInput 
  name="productName" 
  label="Product Name" 
  placeholder="Enter product name"
  required
/>
```

### FormTextarea

Use for: All textarea fields

```tsx
<FormTextarea 
  name="description" 
  label="Description" 
  placeholder="Enter description"
  rows={4}
/>
```

### FormSelect

Use for: All dropdown/select fields

```tsx
<FormSelect
  name="status"
  label="Status"
  options={[
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" }
  ]}
/>
```

### FormCheckbox

Use for: All checkbox fields

```tsx
<FormCheckbox
  name="agreed"
  label="I agree to the terms"
/>
```

## What NOT to Use

❌ DO NOT use inline classNames for form styling:
```tsx
// BAD - hard to maintain
<input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />

// BAD - legacy, broken in dark mode
<input className="input" />

// BAD - missing text color
<input className="flex h-12 border border-border px-4" />
```

❌ DO NOT use without form wrapper:
```tsx
// BAD
<textarea className="w-full h-20..." />
```

❌ DO NOT hand-roll page shells, notice banners, metric tiles, or action links:
```tsx
// BAD
<div className="max-w-5xl mx-auto space-y-8 p-4 md:p-8" />
<div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700" />
<a className="rounded-md bg-primary px-4 py-2 text-sm font-medium" />
<div className="bg-card border border-border rounded-lg p-4" />
```

## Core Layout Components (Mantine)

Import from `@mantine/core` and `@/components/ui/app-shell`:

### `PageShell`
The root container for all pages. Handles horizontal scaling and provides a consistent vertical `Stack`.
- Use `width="xl"` for standard content.
- Use `width="full"` for data-heavy dashboards.

### `PageHeader`
The unified title section.
- Supports `backHref` and `backLabel`.
- Supports `actions` (a `Group` of buttons/controls).

### `LinkCard`
The high-visibility navigation unit.
- Supports `variant` colors (blue, amber, green, violet, teal).
- Supports `metric` (high-contrast number).
- Supports `chartData` (Mini Sparkline via `DashboardChart`).

### `SimpleGrid` / `UnifiedGrid`
Use for all object listings.
- Standard 3-column desktop grid for cards.
- Mobile-first stacking (1 column).

## Form Components (Mantine)

We are transitioning to **Mantine Input** components:
- `TextInput` for names/IDs.
- `Textarea` for descriptions.
- `Select` for status/tags.
- `Button` for all actions.

❌ **DO NOT** use legacy `shadcn/ui` or custom `FormInput` for new development.
❌ **DO NOT** use raw CSS for shadows or borders; use Mantine's `shadow` and `radius` props.

## Unified Cards

Import from `@/components/ui/unified-card`:

```tsx
import {
  UnifiedCard,
  UnifiedCardActions,
  UnifiedCardBody,
  UnifiedCardHeader,
  UnifiedCardSection,
  UnifiedCardText,
} from "@/components/ui/unified-card";
```

Use this family for all first-class object cards:
- `Knowmore` flashcards
- `Checklist` task cards
- `Data` source cards
- dashboard card surfaces that represent live system objects

`Knowmore` is the canonical template. New object cards should match its metadata badges, title area, body spacing, action row, and inline review/edit sections.

## Action Components

Use `Button` from `@/components/ui/button` for all primary, secondary, ghost, and destructive actions.

Use `Card` from `@/components/ui/card` for container surfaces instead of repeating border/background/radius/shadow classes.

## CSS Variables

Always use these for colors (defined in `globals.css`):

| Variable | Use For |
|----------|---------|
| `text-foreground` | Main text in inputs |
| `text-muted-foreground` | Placeholder text |
| `bg-background` | Input background |
| `border-input` | Input border |
| `border-border` | Card/section borders |
| `bg-card` | Card background |
| `bg-primary` | Primary buttons |
| `text-destructive` | Error text |

## Dark/Light Mode Architecture

The 2026 Initiative enforces a dual-mode strategy:
1. **Dark Mode**: Primary operational mode for high-focus intelligence work.
2. **Light Mode**: High-visibility mode for stakeholder review.

All components must use Mantine's CSS variables (`var(--mantine-color-...)`) to ensure perfect contrast in both modes.

## Testing

Always test in both light and dark mode:
- Input text must be readable
- Placeholder text must be visible
- Focus states must be clear

---

Last Updated: 2026-04-28 (Mantine v7 Refactor)
