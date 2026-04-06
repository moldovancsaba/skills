# Checklist Design System

Unified component patterns for consistent, maintainable UI.

## Core Principle

**Always use unified design-system components** - Never hardcode page chrome, actions, or form styling directly in route files.

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

## Layout and Surface Components

Import from `@/components/ui/app-shell`:

```tsx
import {
  EmptyState,
  LinkCard,
  MetricCard,
  MetricGrid,
  Notice,
  PageHeader,
  PageShell,
} from "@/components/ui/app-shell";
```

### `PageShell`

Use for every route-level page container.

### `PageHeader`

Use for title, description, back links, and header actions.

### `Notice`

Use for inline status, success, warning, and error banners.

### `MetricGrid` + `MetricCard`

Use for numeric dashboard tiles and summary cards.

### `LinkCard`

Use for dashboard navigation surfaces.

### `EmptyState`

Use for zero-data states and first-run prompts.

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

## Dark Mode

The unified components automatically handle dark mode via CSS variables. If you encounter issues:

1. Check `globals.css` has the base layer styling:
```css
@layer base {
  input, textarea, select {
    @apply text-foreground;
  }
}
```

2. Use only unified components - they include `text-foreground` class

## Pages Using Unified Components

| Page | File | Status |
|------|------|--------|
| Companies | `home-client.tsx` | ✅ Updated |
| Global Nav | `client-nav.tsx` | ✅ Updated |
| Company Dashboard | `[companyId]/company-dashboard.tsx` | ✅ Updated |
| Data | `data/page.tsx` | ✅ Updated |
| Company Data | `[companyId]/data/page.tsx` | ✅ Updated |
| NBA Tasks | `[companyId]/nba/page.tsx` | ✅ Updated |
| Knowmore | `[companyId]/knowmore/page.tsx` | ✅ Updated |
| Products | `products/page.tsx` | 🔄 Pending |
| Customers | `customers/page.tsx` | 🔄 Pending |
| Competitors | `competitors/page.tsx` | 🔄 Pending |

## Migration Guide

To migrate old pages:

1. Add import:
```tsx
import { FormInput, FormTextarea } from "@/components/ui/form-fields";
```

2. Replace:
```tsx
// OLD
<input className="flex h-12 rounded-md border..." />

// NEW
<FormInput />
```

3. Remove hardcoded `className` - the unified component handles styling

## Testing

Always test in both light and dark mode:
- Input text must be readable
- Placeholder text must be visible
- Focus states must be clear

---

Last Updated: 2026-04-05
