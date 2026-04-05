# Checklist Design System

Unified component patterns for consistent, maintainable UI.

## Core Principle

**Always use unified form components** - Never use hardcoded classNames for form elements.

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
| NBA Tasks | `[companyId]/nba/page.tsx` | ✅ Updated |
| Products | `products/page.tsx` | 🔄 Pending |
| Customers | `customers/page.tsx` | 🔄 Pending |
| Competitors | `competitors/page.tsx` | 🔄 Pending |
| Data | `data/page.tsx` | 🔄 Pending |
| Companies | `home-client.tsx` | 🔄 Pending |

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