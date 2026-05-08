# Hardcoded Style Audit

Date: 2026-05-08

## Scope
- Inspected all non-API files under `src/app`, `src/components`, and `src/lib`.
- Captured hardcoded visual tokens, inline style objects, component `styles` overrides, CSS variable color wiring, legacy utility-class strings, and route-level visual literals.
- Excluded API routes and obvious non-style false positives.

## Summary
- Files with findings: 38
- Total findings: 427
- Other App Files: 2
- Route Pages: 47
- App Shell and Global: 47
- Feature Components: 192
- UI Primitives: 68
- Shared Theme and Libraries: 71

## Highest-Risk Findings
- `src/components/providers.tsx`: the global Mantine theme is heavily hardcoded with dark-centric palettes, component colors, borders, and shadows.
- `src/lib/semantic-theme.ts`: the semantic token layer is fully literalized with fixed hex and rgba values, plus gradient and shadow recipes.
- `src/app/client-nav.tsx`: the navigation shell contains explicit dark background, border, text, and review-highlight colors.
- `src/components/tactical-board.tsx`: the tactical board includes explicit page background, per-column accent styling, drag-state transforms, and custom board chrome.
- `src/lib/ice-colors.ts`: contains Tailwind-like utility strings and HSL token strings, which conflicts with the Mantine-only mandate.

## Other App Files

### src/app/[companyId]/company-dashboard.tsx
- Finding count: 2
- L257 [style-prop, hardcoded-style-key]:     `<Center style={{ minHeight: "60vh" }}>`
- L393 [style-prop, hardcoded-style-key]:     `<Box style={{ position: "fixed", bottom: rem(40), right: rem(40), zIndex: 100 }}>`

## Route Pages

### src/app/[companyId]/data/page.tsx
- Finding count: 8
- L303 [hardcoded-style-key]:     `window.scrollTo({ top: 0, behavior: "smooth" });`
- L517 [style-prop]:     `<Group gap={4} p={4} style={{`
- L518 [rgba/hsl, hardcoded-style-key]:     `backgroundColor: 'rgba(255, 255, 255, 0.03)',`
- L519 [hardcoded-style-key]:     `borderRadius: 8`
- L537 [style-prop]:     `<Group gap={4} p={4} style={{`
- L538 [rgba/hsl, hardcoded-style-key]:     `backgroundColor: 'rgba(255, 255, 255, 0.03)',`
- L539 [hardcoded-style-key]:     `borderRadius: 8`
- L557 [style-prop]:     `<Card style={{ borderStyle: 'dashed' }} ta="center">`

### src/app/[companyId]/goals/page.tsx
- Finding count: 1
- L275 [style-prop, hardcoded-style-key]:     `style={{ flex: 1, maxWidth: 400 }}`

### src/app/[companyId]/knowmore/page.tsx
- Finding count: 10
- L468 [style-prop, hardcoded-style-key]:     `style={{ flex: 1, maxWidth: 400 }}`
- L471 [style-prop]:     `<Group gap={4} p={4} style={{`
- L472 [hardcoded-style-key]:     `borderRadius: "var(--mantine-radius-md)",`
- L473 [rgba/hsl, hardcoded-style-key]:     `backgroundColor: 'rgba(255, 255, 255, 0.03)',`
- L474 [rgba/hsl, hardcoded-style-key]:     `border: '1px solid rgba(255, 255, 255, 0.06)'`
- L490 [style-prop]:     `<Group gap={4} p={4} style={{`
- L491 [hardcoded-style-key]:     `borderRadius: "var(--mantine-radius-md)",`
- L492 [rgba/hsl, hardcoded-style-key]:     `backgroundColor: 'rgba(255, 255, 255, 0.03)',`
- L493 [rgba/hsl, hardcoded-style-key]:     `border: '1px solid rgba(255, 255, 255, 0.06)'`
- L514 [style-prop, hardcoded-style-key]:     `<Card style={{ borderStyle: 'dashed', backgroundColor: 'transparent' }} ta="center">`

### src/app/[companyId]/review/page.tsx
- Finding count: 2
- L131 [style-prop, hardcoded-style-key]:     `<Card style={{ ...getSemanticSurfaceStyle("review", { elevated: false }), borderStyle: 'dashed', backgroundColor: 'transparent' }} ta="center">`
- L191 [style-prop]:     `<Box p="md" style={{ ...getSemanticSurfaceStyle("review", { elevated: false }) }}>`

### src/app/[companyId]/settings/page.tsx
- Finding count: 8
- L95 [hardcoded-style-key]:     `notifications.show({ title: "Error", message: "Failed to save settings.", color: "red" });`
- L115 [hardcoded-style-key]:     `notifications.show({ title: "Error", message: "Failed to save organization settings.", color: "red" });`
- L133 [hardcoded-style-key]:     `notifications.show({ title: "Error", message: "Failed to regenerate secret.", color: "red" });`
- L220 [style-prop, hardcoded-style-key]:     `<Box p="md" style={{ borderRadius: "var(--mantine-radius-md)", ...getSemanticSurfaceStyle("synthesis", { elevated: false }) }}>`
- L308 [style-prop, hardcoded-style-key]:     `<Box p="md" style={{ borderRadius: "var(--mantine-radius-md)", ...getSemanticSurfaceStyle("tactical", { elevated: false }) }}>`
- L310 [style-prop, hardcoded-style-key]:     `<Text  size="sm" style={{ wordBreak: "break-all" }}>`
- L333 [style-prop, hardcoded-style-key]:     `<Box p="xs" style={{ borderRadius: "var(--mantine-radius-sm)", ...getSemanticSurfaceStyle("tactical", { elevated: false }) }}>`
- L341 [style-prop, hardcoded-style-key]:     `<Box p="xs" style={{ borderRadius: "var(--mantine-radius-sm)", ...getSemanticSurfaceStyle("tactical", { elevated: false }) }}>`

### src/app/[companyId]/topics/page.tsx
- Finding count: 6
- L202 [style-prop, hardcoded-style-key]:     `style={{ flex: 1 }}`
- L256 [style-prop]:     `style={{`
- L257 [hardcoded-style-key]:     `opacity: draggingId === topic.id ? 0.4 : 1,`
- L258 [hardcoded-style-key]:     `cursor: draggingId === topic.id ? 'grabbing' : 'grab',`
- L277 [style-prop, hardcoded-style-key]:     `<Box style={{ flex: 1 }}>`
- L340 [style-prop]:     `<Card style={{ ...getSemanticSurfaceStyle("synthesis", { elevated: false }), borderStyle: 'dashed' }} ta="center">`

### src/app/auth/page.tsx
- Finding count: 4
- L25 [hex]:     `<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>`
- L26 [hex]:     `<path fill="#34A853" d="M12 23c2.97 0 5.47-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.96 20.53 7.7 23 12 23z"/>`
- L27 [hex]:     `<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>`
- L28 [hex]:     `<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.96 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>`

### src/app/data/page.tsx
- Finding count: 2
- L217 [hardcoded-style-key]:     `window.scrollTo({ top: 0, behavior: "smooth" });`
- L370 [style-prop]:     `<Card style={{ borderStyle: 'dashed' }} ta="center">`

### src/app/login/page.tsx
- Finding count: 5
- L24 [hex]:     `<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>`
- L25 [hex]:     `<path fill="#34A853" d="M12 23c2.97 0 5.47-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.96 20.53 7.7 23 12 23z"/>`
- L26 [hex]:     `<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>`
- L27 [hex]:     `<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.96 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>`
- L41 [style-prop, hardcoded-style-key]:     `<Center style={{ minHeight: "calc(100vh - 200px)" }}>`

### src/app/strategy/page.tsx
- Finding count: 1
- L41 [style-prop, hardcoded-style-key]:     `<List size="sm" c="dimmed" spacing="xs" style={{ textAlign: "left", maxWidth: 560 }}>`

## App Shell and Global

### src/app/client-nav.tsx
- Finding count: 26
- L38 [hardcoded-style-key]:     `color: "ingress",`
- L46 [hardcoded-style-key]:     `color: "synthesis",`
- L54 [hardcoded-style-key]:     `color: "strategy",`
- L62 [hardcoded-style-key]:     `color: "review",`
- L70 [hardcoded-style-key]:     `color: "knowmore",`
- L78 [hardcoded-style-key]:     `color: "tactical",`
- L86 [hardcoded-style-key]:     `color: "checklist",`
- L183 [hex, style-prop, hardcoded-style-key]:     `<AppShellNavbar p="md" style={{ borderRight: '1px solid #2A3441', backgroundColor: '#0F141B' }}>`
- L204 [rgba/hsl, gradient, hardcoded-style-key]:     `background: "linear-gradient(90deg, rgba(245,158,11,0.24), rgba(245,158,11,0.08))",`
- L205 [hex, hardcoded-style-key]:     `borderLeft: "2px solid #F59E0B",`
- L207 [hex, hardcoded-style-key]:     `label: { color: "#FBC277" },`
- L208 [hex, hardcoded-style-key]:     `description: { color: "#E8C89A" },`
- L250 [hardcoded-style-key]:     `backgroundColor: "transparent",`
- L251 [hardcoded-style-key]:     `borderLeft: "2px solid transparent",`
- L255 [hex, hardcoded-style-key]:     `color: pathname.includes(item.key) ? "#E6EDF3" : "#D2D9E1",`
- L256 [hardcoded-style-key]:     `fontWeight: 500,`
- L301 [style-prop]:     `style={{`
- L302 [hardcoded-style-key]:     `borderRadius: 'var(--mantine-radius-md)',`
- L305 [className]:     `className="theme-toggle-button"`
- L312 [hex]:     `<Text size="xs" c="#9AA4B2">{isDark ? "Light" : "Dark"} Mode</Text>`
- L322 [style-prop]:     `style={{`
- L323 [hardcoded-style-key]:     `borderRadius: 'var(--mantine-radius-md)',`
- L325 [className]:     `className="user-profile-button"`
- L332 [style-prop, hardcoded-style-key]:     `<Box style={{ flex: 1, overflow: 'hidden' }}>`
- L383 [style-prop, hardcoded-style-key]:     `style={{ textDecoration: 'none', cursor: 'pointer' }}`
- L392 [style-prop, hardcoded-style-key]:     `style={{ textDecoration: 'none', cursor: 'pointer' }}`

### src/app/footer.tsx
- Finding count: 8
- L13 [style-prop]:     `style={{`
- L14 [var-color, hardcoded-style-key]:     `borderTop: '1px solid var(--mantine-color-dark-4)',`
- L15 [rgba/hsl, hardcoded-style-key]:     `backgroundColor: 'rgba(0,0,0,0.2)',`
- L16 [hardcoded-style-key]:     `backdropFilter: 'blur(10px)'`
- L22 [style-prop, hardcoded-style-key]:     `<Link href="/privacy" style={{ textDecoration: 'none' }}>`
- L25 [style-prop, hardcoded-style-key]:     `<Link href="/terms" style={{ textDecoration: 'none' }}>`
- L36 [style-prop]:     `style={{`
- L37 [var-color, hardcoded-style-key]:     `backgroundColor: 'var(--mantine-color-dark-6)',`

### src/app/globals.css
- Finding count: 9
- L5 [hardcoded-style-key]:     `--font-display: var(--font-display);`
- L15 [hardcoded-style-key]:     `height: 100%;`
- L22 [var-color, hardcoded-style-key]:     `background-color: var(--mantine-color-body);`
- L23 [var-color, hardcoded-style-key]:     `color: var(--mantine-color-text);`
- L28 [hardcoded-style-key]:     `width: 6px;`
- L29 [hardcoded-style-key]:     `height: 6px;`
- L33 [hardcoded-style-key]:     `background: transparent;`
- L37 [var-color, hardcoded-style-key]:     `background: var(--mantine-color-default-border);`
- L42 [var-color, hardcoded-style-key]:     `background: var(--mantine-color-gray-6);`

### src/app/home-client.tsx
- Finding count: 1
- L263 [rgba/hsl, style-prop, hardcoded-style-key]:     `<Group justify="space-between" mb="md" align="flex-end" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>`

### src/app/layout.tsx
- Finding count: 3
- L44 [className]:     `<body className={`${fontBody.variable} ${fontDisplay.variable} font-body`}>`
- L48 [hardcoded-style-key]:     `navbar={{ width: 280, breakpoint: 'sm' }}`
- L50 [var-color, hardcoded-style-key]:     `main: { background: 'var(--mantine-color-body)' }`

## Feature Components

### src/components/checklist-page.tsx
- Finding count: 2
- L380 [style-prop, hardcoded-style-key]:     `<Text size="xs" c="checklist" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>`
- L392 [style-prop, hardcoded-style-key]:     `leftSection={<ArrowRight size={14} style={{ transform: 'rotate(180deg)' }} />}`

### src/components/dashboard-chart.tsx
- Finding count: 3
- L23 [style-prop, hardcoded-style-key]:     `<Box h={64} w="100%" style={{ opacity: 0.6, transition: "opacity 0.3s ease" }}>`
- L44 [style-prop]:     `style={{`
- L45 [rgba/hsl, hardcoded-style-key]:     `backgroundColor: "rgba(0,0,0,0.8)"`

### src/components/expert-tip-card.tsx
- Finding count: 4
- L19 [style-prop, hardcoded-style-key]:     `<UnifiedCard tone="synthesis" style={{ height: '100%' }}>`
- L53 [style-prop]:     `style={{`
- L54 [rgba/hsl, hardcoded-style-key]:     `backgroundColor: 'rgba(255, 255, 255, 0.03)',`
- L55 [rgba/hsl, hardcoded-style-key]:     `border: '1px solid rgba(255, 255, 255, 0.06)'`

### src/components/help-content.tsx
- Finding count: 7
- L63 [style-prop, var-color, hardcoded-style-key]:     `<Box style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: 'currentColor' }} />`
- L83 [style-prop, var-color, hardcoded-style-key]:     `<Box style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: 'currentColor' }} />`
- L95 [style-prop, hardcoded-style-key]:     `<Paper key={section.id} p="xl" style={{ position: 'relative', ...getSemanticSurfaceStyle("neutral", { elevated: false }) }}>`
- L99 [style-prop, hardcoded-style-key]:     `style={{ position: 'absolute', top: -10, left: 20 }}`
- L117 [style-prop]:     `<Card p="xl"   ta="center" style={{ borderStyle: 'dashed' }}>`
- L164 [style-prop, hardcoded-style-key]:     `<Accordion.Item key={item.id} value={item.id} style={{ border: 'none', marginBottom: rem(12) }}>`
- L169 [style-prop, var-color, hardcoded-style-key]:     `<Paper p="md" style={{ ...getSemanticSurfaceStyle("neutral", { elevated: false }), borderLeft: '3px solid var(--mantine-color-ingress-6)' }}>`

### src/components/intelligence-pulse.tsx
- Finding count: 16
- L108 [rgba/hsl, style-prop, hardcoded-style-key]:     `<Card p="md" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>`
- L146 [style-prop]:     `style={{`
- L147 [hardcoded-style-key]:     `borderRadius: rem(2),`
- L148 [var-color, hardcoded-style-key]:     `backgroundColor: isActive ? 'var(--mantine-color-orange-filled)' : 'var(--mantine-color-dark-4)',`
- L161 [rgba/hsl, style-prop, hardcoded-style-key]:     `<Card p="md" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>`
- L199 [rgba/hsl, style-prop, hardcoded-style-key]:     `<Card p="md" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>`
- L209 [style-prop, hardcoded-style-key]:     `<Group align="flex-end" gap={4} wrap="nowrap" style={{ flex: 1, minHeight: rem(60) }}>`
- L213 [var-color]:     `const barColor = fail < 10 ? "var(--mantine-color-green-filled)" : fail < 20 ? "var(--mantine-color-orange-filled)" : "var(--mantine-color-red-filled)";`
- L222 [style-prop]:     `style={{`
- L223 [hardcoded-style-key]:     `flex: 1,`
- L224 [hardcoded-style-key]:     `height: `${height}%`,`
- L225 [hardcoded-style-key]:     `backgroundColor: barColor,`
- L226 [hardcoded-style-key]:     `opacity: 0.4,`
- L227 [hardcoded-style-key]:     `borderRadius: '2px 2px 0 0',`
- L229 [hardcoded-style-key]:     `cursor: 'pointer'`
- L247 [style-prop, var-color, hardcoded-style-key]:     `<Box h={6} w={6} style={{ borderRadius: '50%', backgroundColor: 'var(--mantine-color-green-filled)' }} />`

### src/components/knowledge-review-card.tsx
- Finding count: 8
- L224 [style-prop]:     `style={{`
- L225 [hardcoded-style-key]:     `borderRadius: "var(--mantine-radius-md)",`
- L226 [rgba/hsl, hardcoded-style-key]:     `backgroundColor: 'rgba(255, 255, 255, 0.03)',`
- L227 [var-color, hardcoded-style-key]:     `borderLeft: `4px solid var(--mantine-color-${getCardColor()}-4)`,`
- L228 [rgba/hsl, hardcoded-style-key]:     `borderTop: '1px solid rgba(255, 255, 255, 0.06)',`
- L229 [rgba/hsl, hardcoded-style-key]:     `borderRight: '1px solid rgba(255, 255, 255, 0.06)',`
- L230 [rgba/hsl, hardcoded-style-key]:     `borderBottom: '1px solid rgba(255, 255, 255, 0.06)'`
- L234 [style-prop, hardcoded-style-key]:     `<MessageSquare size={16} style={{ marginTop: 4, opacity: 0.6 }} />`

### src/components/LanguageSelector.tsx
- Finding count: 1
- L93 [var-color]:     `{checked && <Check size={14} color="var(--mantine-color-ingress-6)" />}`

### src/components/member-list.tsx
- Finding count: 8
- L98 [style-prop, hardcoded-style-key]:     `<UnifiedCard tone="ingress" style={{ height: '100%' }}>`
- L108 [style-prop, hardcoded-style-key]:     `<UnifiedCard tone="ingress" style={{ height: '100%' }}>`
- L130 [style-prop, hardcoded-style-key]:     `<Box style={{ flex: 1 }}>`
- L159 [style-prop]:     `style={{`
- L160 [hardcoded-style-key]:     `borderRadius: "var(--mantine-radius-md)",`
- L165 [style-prop, hardcoded-style-key]:     `<Group gap="sm" wrap="nowrap" style={{ flex: 1 }}>`
- L169 [style-prop, hardcoded-style-key]:     `<Box style={{ flex: 1, minWidth: 0 }}>`
- L173 [var-color]:     `<Shield size={12} color={member.role === 'OWNER' ? 'var(--mantine-color-strategy-4)' : 'var(--mantine-color-ingress-4)'} />`

### src/components/MetricCard.tsx
- Finding count: 5
- L21 [style-prop, hardcoded-style-key]:     `<div style={{ height: '100%' }}>`
- L24 [style-prop]:     `style={{`
- L25 [hardcoded-style-key]:     `height: '100%',`
- L34 [style-prop, hardcoded-style-key]:     `<Icon size={16} style={{ opacity: 0.5 }} />`
- L38 [style-prop, hardcoded-style-key]:     `<Text size="xl"  style={{ fontSize: rem(24) }}>`

### src/components/providers.tsx
- Finding count: 72
- L13 [hex]:     `black: "#0B0F14",`
- L14 [hex]:     `white: "#E6EDF3",`
- L17 [hex]:     `dark: ["#C9D1D9", "#B0BAC5", "#8B949E", "#6E7681", "#484F58", "#30363D", "#21262D", "#161C24", "#0F141B", "#0B0F14"],`
- L18 [hex]:     `ingress: ["#DBEAFE", "#BFDBFE", "#93C5FD", "#60A5FA", "#3B82F6", "#2563EB", "#1D4ED8", "#1E40AF", "#10243F", "#0B1727"],`
- L19 [hex]:     `synthesis: ["#E0E7FF", "#C7D2FE", "#A5B4FC", "#818CF8", "#6366F1", "#4F46E5", "#4338CA", "#3730A3", "#1A1D4A", "#11142F"],`
- L20 [hex]:     `knowmore: ["#D1FAE5", "#A7F3D0", "#6EE7B7", "#34D399", "#10B981", "#059669", "#047857", "#065F46", "#0F2D27", "#081C18"],`
- L21 [hex]:     `strategy: ["#EDE9FE", "#DDD6FE", "#C4B5FD", "#A78BFA", "#8B5CF6", "#7C3AED", "#6D28D9", "#5B21B6", "#24163F", "#140D24"],`
- L22 [hex]:     `checklist: ["#E0F2FE", "#BAE6FD", "#7DD3FC", "#38BDF8", "#0EA5E9", "#0284C7", "#0369A1", "#075985", "#102838", "#091822"],`
- L23 [hex]:     `tactical: ["#CCFBF1", "#99F6E4", "#5EEAD4", "#2DD4BF", "#14B8A6", "#0D9488", "#0F766E", "#115E59", "#102D2A", "#091A18"],`
- L24 [hex]:     `review: ["#FEF3C7", "#FDE68A", "#FCD34D", "#FBBF24", "#F59E0B", "#D97706", "#B45309", "#92400E", "#3B2A12", "#24190B"],`
- L25 [hex]:     `brand: ["#DBEAFE", "#BFDBFE", "#93C5FD", "#60A5FA", "#3B82F6", "#2563EB", "#1D4ED8", "#1E40AF", "#10243F", "#0B1727"],`
- L26 [hex]:     `knowledge: ["#D1FAE5", "#A7F3D0", "#6EE7B7", "#34D399", "#10B981", "#059669", "#047857", "#065F46", "#0F2D27", "#081C18"],`
- L27 [hex]:     `execution: ["#E0F2FE", "#BAE6FD", "#7DD3FC", "#38BDF8", "#0EA5E9", "#0284C7", "#0369A1", "#075985", "#102838", "#091822"],`
- L38 [hardcoded-style-key]:     `fontWeight: "700",`
- L40 [hardcoded-style-key]:     `h1: { fontSize: rem(32), lineHeight: "1.1" },`
- L41 [hardcoded-style-key]:     `h2: { fontSize: rem(24), lineHeight: "1.2" },`
- L42 [hardcoded-style-key]:     `h3: { fontSize: rem(20), lineHeight: "1.25" },`
- L43 [hardcoded-style-key]:     `h4: { fontSize: rem(18), lineHeight: "1.4" },`
- L47 [hex]:     `appBg: "#0B0F14",`
- L48 [hex]:     `sidebarBg: "#0F141B",`
- L49 [hex]:     `surfaceBase: "#161C24",`
- L50 [hex]:     `surfaceElevated: "#1B2430",`
- L51 [hex]:     `borderPrimary: "#2A3441",`
- L52 [hex]:     `textPrimary: "#E6EDF3",`
- L53 [hex]:     `textSecondary: "#9AA4B2",`
- L54 [hex]:     `textMuted: "#6B7280",`
- L63 [styles-prop]:     `styles: {`
- L65 [hex, hardcoded-style-key]:     `backgroundColor: "#0B0F14",`
- L66 [hex, hardcoded-style-key]:     `color: "#E6EDF3",`
- L71 [styles-prop]:     `styles: {`
- L73 [hardcoded-style-key]:     `borderRadius: rem(10),`
- L74 [hex, hardcoded-style-key]:     `color: "#E6EDF3",`
- L77 [hardcoded-style-key]:     `fontWeight: 600,`
- L81 [hex, hardcoded-style-key]:     `color: "#9AA4B2",`
- L99 [gradient, hardcoded-style-key]:     `background: `linear-gradient(135deg, ${module.color}, ${module.color})`,`
- L104 [hardcoded-style-key]:     `background: module.surface,`
- L105 [hardcoded-style-key]:     `border: `1px solid ${module.border}`,`
- L110 [hardcoded-style-key]:     `borderColor: module.border,`
- L111 [hardcoded-style-key]:     `color: module.color,`
- L116 [hex, hardcoded-style-key]:     `color: "#E6EDF3",`
- L117 [rgba/hsl, hardcoded-style-key]:     `boxShadow: "0 8px 18px rgba(0, 0, 0, 0.22)",`
- L128 [styles-prop]:     `styles: {`
- L132 [rgba/hsl, hardcoded-style-key]:     `boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",`
- L142 [styles-prop]:     `styles: {`
- L144 [hex, hardcoded-style-key]:     `backgroundColor: "#161C24",`
- L145 [hex, hardcoded-style-key]:     `borderColor: "#2A3441",`
- L146 [rgba/hsl, hardcoded-style-key]:     `boxShadow: "0 10px 24px rgba(0,0,0,0.24)",`
- L147 [hex, hardcoded-style-key]:     `color: "#E6EDF3",`
- L156 [styles-prop]:     `styles: {`
- L158 [rgba/hsl, hardcoded-style-key]:     `border: "1px solid rgba(255,255,255,0.06)",`
- L159 [rgba/hsl, hardcoded-style-key]:     `boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",`
- L167 [styles-prop]:     `styles: {`
- L169 [hex, hardcoded-style-key]:     `color: "#E6EDF3",`
- L177 [styles-prop]:     `styles: {`
- L179 [hex, hardcoded-style-key]:     `color: "#E6EDF3",`
- L187 [hardcoded-style-key]:     `fontWeight: 500,`
- L189 [hardcoded-style-key]:     `fontSize: theme.fontSizes.sm,`
- L190 [hex, hardcoded-style-key]:     `color: "#9AA4B2",`
- L195 [hex, hardcoded-style-key]:     `color: "#6B7280",`
- L200 [styles-prop]:     `styles: {`
- L202 [hex, hardcoded-style-key]:     `backgroundColor: "#1B2430",`
- L203 [hex, hardcoded-style-key]:     `border: "1px solid #2A3441",`
- L204 [hex, hardcoded-style-key]:     `color: "#E6EDF3",`
- L209 [styles-prop]:     `styles: {`
- L211 [hex, hardcoded-style-key]:     `backgroundColor: "#1B2430",`
- L212 [hex, hardcoded-style-key]:     `border: "1px solid #2A3441",`
- L213 [rgba/hsl, hardcoded-style-key]:     `boxShadow: "0 24px 60px rgba(0,0,0,0.42)",`
- L216 [hex, hardcoded-style-key]:     `backgroundColor: "#1B2430",`
- L221 [styles-prop]:     `styles: {`
- L223 [hex, hardcoded-style-key]:     `borderColor: "#2A3441",`
- L226 [hex, hardcoded-style-key]:     `color: "#6B7280",`
- L227 [hardcoded-style-key]:     `fontWeight: 500,`

### src/components/tactical-board.tsx
- Finding count: 29
- L143 [rgba/hsl, hardcoded-style-key]:     `color: 'rgba(15, 20, 27, 0.92)'`
- L169 [hardcoded-style-key]:     `{ label: "Impact",     value: item.impact,     color: "review" },`
- L170 [hardcoded-style-key]:     `{ label: "Confidence", value: item.confidence, color: "tactical" },`
- L171 [hardcoded-style-key]:     `{ label: "Ease",       value: item.ease,       color: "strategy" },`
- L189 [var-color]:     `<Sparkles size={14} color="var(--mantine-color-ingress-6)" />`
- L219 [style-prop, var-color, hardcoded-style-key]:     `<Paper p="md" style={{ ...getSemanticSurfaceStyle("review", { elevated: false }), borderLeft: '4px solid var(--mantine-color-review-4)' }}>`
- L249 [style-prop, hardcoded-style-key]:     `style={{ flex: 1 }}`
- L426 [hex, style-prop, hardcoded-style-key]:     `<Box h="100vh" style={{ display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "#0B0F14" }}>`
- L439 [style-prop, hardcoded-style-key]:     `style={{ flex: 1, overflowX: "auto", overflowY: "hidden" }}`
- L465 [style-prop]:     `style={{ flexShrink: 0 }}`
- L470 [style-prop]:     `style={{`
- L471 [hardcoded-style-key]:     `borderTop: `4px solid ${col.accent}`,`
- L477 [style-prop, hardcoded-style-key]:     `<Stack gap={2} style={{ overflow: 'hidden' }}>`
- L478 [style-prop, hardcoded-style-key]:     `<Text size="sm" style={{ color: col.accent, fontWeight: 650 }} truncate>`
- L500 [style-prop]:     `style={{`
- L501 [hardcoded-style-key]:     `flex: 1,`
- L502 [hardcoded-style-key]:     `border: snapshot.isDraggingOver`
- L505 [hardcoded-style-key]:     `backgroundColor: snapshot.isDraggingOver ? `${col.accent}10` : "transparent",`
- L507 [hardcoded-style-key]:     `display: 'flex',`
- L508 [hardcoded-style-key]:     `flexDirection: 'column',`
- L509 [hardcoded-style-key]:     `minHeight: 0`
- L512 [style-prop, hardcoded-style-key]:     `<ScrollArea offsetScrollbars style={{ flex: 1 }} viewportProps={{ style: { display: 'flex', flexDirection: 'column' } }}>`
- L513 [style-prop, hardcoded-style-key]:     `<Stack gap="sm" p={4} style={{ flex: 1 }}>`
- L522 [style-prop]:     `style={{ ...provided.draggableProps.style }}`
- L531 [style-prop]:     `style={{`
- L532 [hardcoded-style-key]:     `cursor: snapshot.isDragging ? "grabbing" : "pointer",`
- L533 [hardcoded-style-key]:     `borderColor: snapshot.isDragging`
- L536 [hardcoded-style-key]:     `transform: snapshot.isDragging ? "rotate(1deg) scale(1.02)" : "none",`
- L561 [style-prop, hardcoded-style-key]:     `<Text size="xs" style={{ color: col.accent, fontVariantNumeric: "tabular-nums" }}>`

### src/components/task-review-card.tsx
- Finding count: 7
- L161 [style-prop, hardcoded-style-key]:     `style={{ opacity: item.processingStatus === "DECLINED" ? 0.6 : 1 }}`
- L166 [style-prop, hardcoded-style-key]:     `<Group justify="space-between" wrap="nowrap" style={{ width: '100%' }}>`
- L192 [style-prop]:     `style={{`
- L193 [hardcoded-style-key]:     `borderRadius: rem(8),`
- L194 [rgba/hsl, hardcoded-style-key]:     `backgroundColor: 'rgba(255, 255, 255, 0.03)',`
- L195 [var-color, hardcoded-style-key]:     `borderLeft: "4px solid var(--mantine-color-blue-6)"`
- L199 [style-prop, hardcoded-style-key]:     `<MessageSquare size={14} style={{ marginTop: rem(2), opacity: 0.7 }} />`

### src/components/trace-viewer.tsx
- Finding count: 30
- L61 [style-prop]:     `style={{`
- L62 [hardcoded-style-key]:     `position: 'fixed',`
- L63 [hardcoded-style-key]:     `top: 0,`
- L64 [hardcoded-style-key]:     `bottom: 0,`
- L65 [hardcoded-style-key]:     `right: 0,`
- L66 [hardcoded-style-key]:     `width: rem(400),`
- L67 [var-color, hardcoded-style-key]:     `backgroundColor: 'var(--mantine-color-body)',`
- L68 [var-color, hardcoded-style-key]:     `borderLeft: '1px solid var(--mantine-color-default-border)',`
- L69 [hardcoded-style-key]:     `boxShadow: 'var(--mantine-shadow-xl)',`
- L70 [hardcoded-style-key]:     `zIndex: 1000,`
- L71 [hardcoded-style-key]:     `display: 'flex',`
- L72 [hardcoded-style-key]:     `flexDirection: 'column',`
- L89 [style-prop, hardcoded-style-key]:     `<Box style={{ flex: 1, position: 'relative' }}>`
- L92 [style-prop]:     `style={{`
- L93 [hardcoded-style-key]:     `position: 'absolute',`
- L94 [hardcoded-style-key]:     `left: 17,`
- L95 [hardcoded-style-key]:     `top: 20,`
- L96 [hardcoded-style-key]:     `bottom: 20,`
- L97 [hardcoded-style-key]:     `width: 2,`
- L98 [var-color, hardcoded-style-key]:     `backgroundColor: 'var(--mantine-color-default-border)',`
- L99 [hardcoded-style-key]:     `opacity: 0.5`
- L110 [style-prop, hardcoded-style-key]:     `<Group key={node.id} wrap="nowrap" align="flex-start" gap="lg" style={{ position: 'relative', zIndex: 1 }}>`
- L116 [style-prop]:     `style={{`
- L117 [var-color, hardcoded-style-key]:     `boxShadow: '0 0 0 4px var(--mantine-color-body)'`
- L129 [style-prop, hardcoded-style-key]:     `<Text size="sm"  style={{ lineHeight: 1.4 }}>`
- L141 [style-prop]:     `style={{`
- L142 [hardcoded-style-key]:     `borderRadius: 'var(--mantine-radius-md)',`
- L143 [var-color, hardcoded-style-key]:     `backgroundColor: 'var(--mantine-color-default-hover)',`
- L144 [var-color, hardcoded-style-key]:     `border: '1px solid var(--mantine-color-default-border)'`
- L147 [style-prop, hardcoded-style-key]:     `<Text size="xs" c="dimmed"  style={{ lineHeight: 1.6, fontStyle: 'italic' }}>`

## UI Primitives

### src/components/ui/app-shell.tsx
- Finding count: 17
- L51 [style-prop, hardcoded-style-key]:     `style={{ position: "relative" }}`
- L84 [style-prop, hardcoded-style-key]:     `style={{ display: "flex", alignItems: "center", gap: 4 }}`
- L199 [hex]:     `<Text c="#9AA4B2" fw={500}>`
- L209 [var-color]:     `<Text c={`var(--mantine-color-${mantineColor}-4)`}>`
- L235 [style-prop, hardcoded-style-key]:     `<Card style={{ borderStyle: "dashed", backgroundColor: 'transparent' }} ta="center">`
- L283 [style-prop, hardcoded-style-key]:     `style={{ display: "block", height: "100%", textDecoration: 'none' }}`
- L286 [style-prop]:     `style={{`
- L289 [hardcoded-style-key]:     `overflow: "hidden",`
- L298 [hardcoded-style-key]:     `overflow: "hidden",`
- L303 [style-prop, hardcoded-style-key]:     `<Stack gap="xl" h="100%" style={{ position: 'relative', zIndex: 1 }}>`
- L309 [var-color]:     `<Text c={`var(--mantine-color-${mantineColor}-4)`} fw={600}>`
- L319 [hex]:     `<Text c="#9AA4B2" lineClamp={2}>`
- L328 [var-color]:     `color={`var(--mantine-color-${mantineColor}-6)`}`
- L334 [var-color]:     `<Text size="xs" c={`var(--mantine-color-${mantineColor}-4)`} fw={600}>`
- L372 [style-prop]:     `style={{`
- L373 [hardcoded-style-key]:     `borderRadius: 3,`
- L374 [var-color, hardcoded-style-key]:     `backgroundColor: segment.key === activeKey ? `var(--mantine-color-${toneToMantineColor(segment.tone as ModuleTone)}-filled)` : 'var(--mantine-color-gray-2)',`

### src/components/ui/hashtag-chip-list.tsx
- Finding count: 1
- L40 [style-prop, hardcoded-style-key]:     `style={{ cursor: onToggle ? "pointer" : "default" }}`

### src/components/ui/hashtag-multi-select.tsx
- Finding count: 28
- L93 [style-prop]:     `style={{`
- L94 [hardcoded-style-key]:     `minHeight: rem(42),`
- L95 [hardcoded-style-key]:     `borderRadius: 'var(--mantine-radius-md)',`
- L96 [var-color, hardcoded-style-key]:     `border: `1px solid ${error ? 'var(--mantine-color-red-filled)' : isOpen ? 'var(--mantine-color-ingress-filled)' : 'var(--mantine-color-dark-4)'}`,`
- L97 [rgba/hsl, hardcoded-style-key]:     `backgroundColor: 'rgba(0,0,0,0.2)',`
- L100 [hardcoded-style-key]:     `display: 'flex',`
- L102 [hardcoded-style-key]:     `gap: rem(6),`
- L133 [style-prop]:     `style={{`
- L134 [hardcoded-style-key]:     `flex: 1,`
- L136 [hardcoded-style-key]:     `backgroundColor: 'transparent',`
- L137 [hardcoded-style-key]:     `border: 'none',`
- L139 [hardcoded-style-key]:     `color: 'white',`
- L140 [hardcoded-style-key]:     `fontSize: 'var(--mantine-font-size-sm)',`
- L157 [style-prop]:     `style={{`
- L159 [hardcoded-style-key]:     `position: 'absolute',`
- L160 [hardcoded-style-key]:     `top: '100%',`
- L161 [hardcoded-style-key]:     `left: 0,`
- L162 [hardcoded-style-key]:     `right: 0,`
- L163 [hardcoded-style-key]:     `zIndex: 1000,`
- L165 [hardcoded-style-key]:     `borderRadius: 'var(--mantine-radius-lg)',`
- L166 [var-color, hardcoded-style-key]:     `border: '1px solid var(--mantine-color-dark-4)',`
- L167 [rgba/hsl, hardcoded-style-key]:     `backgroundColor: 'rgba(20, 20, 20, 0.95)',`
- L182 [hardcoded-style-key]:     `borderRadius: 'var(--mantine-radius-md)',`
- L185 [rgba/hsl, hardcoded-style-key]:     `backgroundColor: 'rgba(255, 255, 255, 0.05)',`
- L196 [style-prop, var-color, hardcoded-style-key]:     `<Check size={14} color="var(--mantine-color-ingress-filled)" style={{ opacity: 0.6 }} />`
- L209 [hardcoded-style-key]:     `borderRadius: 'var(--mantine-radius-md)',`
- L210 [var-color, hardcoded-style-key]:     `borderTop: '1px solid var(--mantine-color-dark-4)',`
- L214 [rgba/hsl, hardcoded-style-key]:     `backgroundColor: 'rgba(255, 255, 255, 0.05)',`

### src/components/ui/logo.tsx
- Finding count: 2
- L12 [style-prop, hardcoded-style-key]:     `<Link href="/" style={{ textDecoration: "none" }}>`
- L24 [style-prop]:     `style={{`

### src/components/ui/unified-card-modal.tsx
- Finding count: 8
- L46 [rgba/hsl, hardcoded-style-key]:     `color: "rgba(11, 15, 20, 0.92)",`
- L52 [rgba/hsl, gradient, hardcoded-style-key]:     `background: `linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)), ${theme.surface}`,`
- L53 [hardcoded-style-key]:     `border: `1px solid ${theme.border}`,`
- L54 [rgba/hsl, hardcoded-style-key]:     `boxShadow: `0 24px 72px rgba(0, 0, 0, 0.42), 0 0 0 1px ${theme.border}`,`
- L57 [hardcoded-style-key]:     `background: "transparent",`
- L58 [rgba/hsl, hardcoded-style-key]:     `borderBottom: "1px solid rgba(255,255,255,0.06)",`
- L65 [hardcoded-style-key]:     `width: "100%",`
- L73 [hex]:     `<Text size="xs" c="#9AA4B2">`

### src/components/ui/unified-card.tsx
- Finding count: 12
- L23 [hardcoded-style-key]:     `display: "-webkit-box",`
- L26 [hardcoded-style-key]:     `overflow: "hidden",`
- L106 [hardcoded-style-key]:     `const titleStyle = clampTitle ? { ...singleLineClampStyle, fontWeight: 650 } : { fontWeight: 650 };`
- L111 [style-prop, hardcoded-style-key]:     `<Stack gap="sm" style={{ flex: 1 }}>`
- L124 [hex]:     `<Text c="#9AA4B2">`
- L153 [hex]:     `<Text style={style} mt={mt} c="#9AA4B2" lh={1.6}>`
- L163 [style-prop]:     `style={{`
- L164 [hardcoded-style-key]:     `borderRadius: rem(12),`
- L165 [hex, rgba/hsl, gradient, hardcoded-style-key]:     `background: `linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01)), var(--module-hover-surface, #1B2430)`,`
- L166 [rgba/hsl, hardcoded-style-key]:     `border: "1px solid rgba(255,255,255,0.05)",`
- L187 [style-prop]:     `style={{`
- L188 [rgba/hsl, hardcoded-style-key]:     `borderTop: "1px solid rgba(255,255,255,0.05)",`

## Shared Theme and Libraries

### src/lib/cookie-consent.tsx
- Finding count: 12
- L62 [style-prop]:     `style={{`
- L63 [hardcoded-style-key]:     `position: 'fixed',`
- L64 [hardcoded-style-key]:     `bottom: 0,`
- L65 [hardcoded-style-key]:     `left: 0,`
- L66 [hardcoded-style-key]:     `right: 0,`
- L67 [hardcoded-style-key]:     `zIndex: 1000,`
- L72 [style-prop]:     `style={{`
- L74 [hardcoded-style-key]:     `width: '100%',`
- L78 [style-prop]:     `<Box p="md" style={{ pointerEvents: 'auto' }}>`
- L84 [style-prop]:     `style={{`
- L86 [hardcoded-style-key]:     `maxWidth: '1200px',`
- L92 [style-prop, hardcoded-style-key]:     `<Stack gap={4} style={{ flex: 1 }}>`

### src/lib/ice-colors.ts
- Finding count: 9
- L10 [rgba/hsl, tailwind-token]:     `if (iceScore <= 50) return "text-[hsl(var(--color-low))] bg-[hsl(var(--color-low)/0.1)] border-[hsl(var(--color-low)/0.2)]";`
- L11 [rgba/hsl, tailwind-token]:     `if (iceScore <= 125) return "text-[hsl(var(--color-medium))] bg-[hsl(var(--color-medium)/0.1)] border-[hsl(var(--color-medium)/0.2)]";`
- L12 [rgba/hsl, tailwind-token]:     `if (iceScore <= 250) return "text-[hsl(var(--color-medium))] bg-[hsl(var(--color-medium)/0.1)] border-[hsl(var(--color-medium)/0.2)]";`
- L13 [rgba/hsl, tailwind-token]:     `if (iceScore <= 500) return "text-[hsl(var(--color-execution))] bg-[hsl(var(--color-execution)/0.1)] border-[hsl(var(--color-execution)/0.2)]";`
- L14 [rgba/hsl, tailwind-token]:     `return "text-[hsl(var(--color-high))] bg-[hsl(var(--color-high)/0.1)] border-[hsl(var(--color-high)/0.2)]";`
- L18 [rgba/hsl, tailwind-token]:     `if (metricTotal <= 50) return "text-[hsl(var(--color-low))] bg-[hsl(var(--color-low)/0.1)] border-[hsl(var(--color-low)/0.2)]";`
- L19 [rgba/hsl, tailwind-token]:     `if (metricTotal <= 150) return "text-[hsl(var(--color-medium))] bg-[hsl(var(--color-medium)/0.1)] border-[hsl(var(--color-medium)/0.2)]";`
- L20 [rgba/hsl, tailwind-token]:     `if (metricTotal <= 400) return "text-[hsl(var(--color-execution))] bg-[hsl(var(--color-execution)/0.1)] border-[hsl(var(--color-execution)/0.2)]";`
- L21 [rgba/hsl, tailwind-token]:     `return "text-[hsl(var(--color-high))] bg-[hsl(var(--color-high)/0.1)] border-[hsl(var(--color-high)/0.2)]";`

### src/lib/semantic-theme.ts
- Finding count: 50
- L41 [hex, hardcoded-style-key]:     `color: "#3B82F6",`
- L42 [hex]:     `surface: "#10243F",`
- L43 [hex]:     `hoverSurface: "#143154",`
- L44 [rgba/hsl]:     `glow: "rgba(59,130,246,0.18)",`
- L45 [rgba/hsl, hardcoded-style-key]:     `border: "rgba(59,130,246,0.22)",`
- L49 [hex, hardcoded-style-key]:     `color: "#6366F1",`
- L50 [hex]:     `surface: "#1A1D4A",`
- L51 [hex]:     `hoverSurface: "#232864",`
- L52 [rgba/hsl]:     `glow: "rgba(99,102,241,0.18)",`
- L53 [rgba/hsl, hardcoded-style-key]:     `border: "rgba(99,102,241,0.22)",`
- L57 [hex, hardcoded-style-key]:     `color: "#10B981",`
- L58 [hex]:     `surface: "#0F2D27",`
- L59 [hex]:     `hoverSurface: "#153D35",`
- L60 [rgba/hsl]:     `glow: "rgba(16,185,129,0.18)",`
- L61 [rgba/hsl, hardcoded-style-key]:     `border: "rgba(16,185,129,0.22)",`
- L65 [hex, hardcoded-style-key]:     `color: "#8B5CF6",`
- L66 [hex]:     `surface: "#24163F",`
- L67 [hex]:     `hoverSurface: "#312058",`
- L68 [rgba/hsl]:     `glow: "rgba(139,92,246,0.18)",`
- L69 [rgba/hsl, hardcoded-style-key]:     `border: "rgba(139,92,246,0.22)",`
- L73 [hex, hardcoded-style-key]:     `color: "#0EA5E9",`
- L74 [hex]:     `surface: "#102838",`
- L75 [hex]:     `hoverSurface: "#16384C",`
- L76 [rgba/hsl]:     `glow: "rgba(14,165,233,0.18)",`
- L77 [rgba/hsl, hardcoded-style-key]:     `border: "rgba(14,165,233,0.22)",`
- L81 [hex, hardcoded-style-key]:     `color: "#14B8A6",`
- L82 [hex]:     `surface: "#102D2A",`
- L83 [hex]:     `hoverSurface: "#17403C",`
- L84 [rgba/hsl]:     `glow: "rgba(20,184,166,0.18)",`
- L85 [rgba/hsl, hardcoded-style-key]:     `border: "rgba(20,184,166,0.22)",`
- L89 [hex, hardcoded-style-key]:     `color: "#F59E0B",`
- L90 [hex]:     `surface: "#3B2A12",`
- L91 [hex]:     `hoverSurface: "#513A18",`
- L92 [rgba/hsl]:     `glow: "rgba(245,158,11,0.18)",`
- L93 [rgba/hsl, hardcoded-style-key]:     `border: "rgba(245,158,11,0.22)",`
- L97 [hex, hardcoded-style-key]:     `color: "#9AA4B2",`
- L98 [hex]:     `surface: "#161C24",`
- L99 [hex]:     `hoverSurface: "#1B2430",`
- L100 [rgba/hsl]:     `glow: "rgba(154,164,178,0.12)",`
- L101 [rgba/hsl, hardcoded-style-key]:     `border: "rgba(154,164,178,0.18)",`
- L183 [rgba/hsl, gradient, hardcoded-style-key]:     `background: `linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)), ${module.surface}`,`
- L184 [hardcoded-style-key]:     `border: `1px solid ${module.border}`,`
- L185 [hardcoded-style-key]:     `boxShadow: elevated`
- L186 [rgba/hsl]:     `? `0 4px 12px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255,255,255,0.03)``
- L187 [rgba/hsl]:     `: `0 1px 0 rgba(255,255,255,0.03) inset`,`
- L195 [rgba/hsl, gradient, hardcoded-style-key]:     `background: `linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), ${module.hoverSurface}`,`
- L196 [rgba/hsl, hardcoded-style-key]:     `boxShadow: `0 0 0 1px rgba(${module.rgb},0.24), 0 10px 24px ${module.glow}`,`
- L203 [rgba/hsl, gradient, hardcoded-style-key]:     `background: `linear-gradient(90deg, rgba(${module.rgb},0.22), rgba(${module.rgb},0.06))`,`
- L204 [rgba/hsl, hardcoded-style-key]:     `borderLeft: `2px solid rgb(${module.rgb})`,`
- L211 [rgba/hsl, gradient, hardcoded-style-key]:     `background: `linear-gradient(90deg, rgba(${module.rgb},0.12), rgba(${module.rgb},0.03))`,`
