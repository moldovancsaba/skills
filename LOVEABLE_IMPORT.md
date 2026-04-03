# LOVEABLE IMPORT SPECIFICATION

## Source Repository
https://github.com/moldovancsaba/remix-of-gtm-ai-navigator-68.git

## Technology Stack
- **Framework**: Vite + React + TypeScript
- **UI Library**: shadcn-ui (49 components)
- **Styling**: Tailwind CSS
- **Platform**: Marketing AI Navigator

---

## 1. PAGES (15 Pages)

### 1.1 Dashboard
- **File**: `src/pages/Dashboard.tsx`
- **Features**: 
  - Metric cards (visitors, leads, revenue, AI ops)
  - Performance overview
  - Quick actions
- **Priority**: HIGH

### 1.2 Intelligence Page
- **File**: `src/pages/IntelligencePage.tsx`
- **Features**:
  - AI-powered insights
  - Competitor analysis
  - Market intelligence
  - Trend analysis
- **Priority**: HIGH

### 1.3 Lead Generation Page
- **File**: `src/pages/LeadGenerationPage.tsx`
- **Features**:
  - Lead capture forms
  - Landing page builder
  - Campaign management
  - Lead scoring
- **Priority**: HIGH

### 1.4 Content Creation Page
- **File**: `src/pages/ContentCreationPage.tsx`
- **Features**:
  - AI content generation
  - Copy templates
  - Multi-channel content
  - Content calendar
- **Priority**: HIGH

### 1.5 CRM Page
- **File**: `src/pages/CrmPage.tsx`
- **Features**:
  - Contact management
  - Deal pipeline
  - Communication history
  - Task management
- **Priority**: HIGH

### 1.6 Strategy Page
- **File**: `src/pages/StrategyPage.tsx`
- **Features**:
  - Strategic planning
  - Goal setting
  - Growth strategy
  - KPI tracking
- **Priority**: HIGH

### 1.7 Brand Page
- **File**: `src/pages/BrandPage.tsx`
- **Features**:
  - Brand guidelines
  - Logo assets
  - Color schemes
  - Messaging
- **Priority**: MEDIUM

### 1.8 Execution Page
- **File**: `src/pages/ExecutionPage.tsx`
- **Features**:
  - Task execution
  - Automation
  - Workflow management
- **Priority**: HIGH

### 1.9 Portfolio Page
- **File**: `src/pages/PortfolioPage.tsx`
- **Features**:
  - Case studies
  - Project showcase
  - Results gallery
- **Priority**: MEDIUM

### 1.10 My Offers Page
- **File**: `src/pages/MyOffersPage.tsx`
- **Features**:
  - Offer management
  - Pricing packages
  - Service descriptions
- **Priority**: MEDIUM

### 1.11 Strategy Setup
- **File**: `src/pages/StrategySetup.tsx`
- **Features**:
  - Initial strategy setup
  - Business analysis
  - Market research
- **Priority**: HIGH

### 1.12 Pre-Fortitude Page
- **File**: `src/pages/PreFortitudePage.tsx`
- **Features**:
  - Pre-assessment
  - Health check
- **Priority**: MEDIUM

### 1.13 Layer Pages
- **File**: `src/pages/LayerPages.tsx`
- **Features**:
  - Navigation layers
- **Priority**: LOW

### 1.14 Index Page
- **File**: `src/pages/Index.tsx`
- **Features**: Landing/redirect

### 1.15 Not Found
- **File**: `src/pages/NotFound.tsx`
- **Features**: 404 page

---

## 2. UI COMPONENTS (49 Components)

### Navigation & Layout
- [ ] sidebar.tsx
- [ ] sheet.tsx
- [ ] drawer.tsx
- [ ] resizable.tsx
- [ ] scroll-area.tsx
- [ ] navigation-menu.tsx
- [ ] menubar.tsx
- [ ] breadcrumb.tsx

### Input & Forms
- [ ] input.tsx
- [ ] textarea.tsx
- [ ] select.tsx
- [ ] form.tsx
- [ ] input-otp.tsx
- [ ] checkbox.tsx
- [ ] radio-group.tsx
- [ ] switch.tsx
- [ ] toggle.tsx
- [ ] toggle-group.tsx

### Display & Feedback
- [ ] button.tsx
- [ ] badge.tsx
- [ ] card.tsx
- [ ] progress.tsx
- [ ] skeleton.tsx
- [ ] avatar.tsx
- [ ] alert.tsx
- [ ] alert-dialog.tsx
- [ ] toast.tsx
- [ ] toaster.tsx
- [ ] sonner.tsx
- [ ] tooltip.tsx
- [ ] popover.tsx
- [ ] hover-card.tsx

### Layout Components
- [ ] dialog.tsx
- [ ] modal (via dialog)
- [ ] table.tsx
- [ ] tabs.tsx
- [ ] accordion.tsx
- [ ] collapsible.tsx
- [ ] label.tsx
- [ ] separator.tsx

### Interactive
- [ ] slider.tsx
- [ ] calendar.tsx
- [ ] dropdown-menu.tsx
- [ ] context-menu.tsx
- [ ] command.tsx

### Media
- [ ] carousel.tsx
- [ ] aspect-ratio.tsx
- [ ] chart.tsx

### Utility
- [ ] pagination.tsx

---

## 3. CUSTOM COMPONENTS

- **AgentCard.tsx**: AI agent display card
- **AppSidebar.tsx**: Main navigation sidebar
- **MetricCard.tsx**: Dashboard metric display
- **NavLink.tsx**: Navigation link
- **StrategyHeader.tsx**: Strategy page header

---

## 4. HOOKS

- **use-mobile.tsx**: Mobile detection
- **use-toast.ts**: Toast notification hook

---

## 5. LIBRARIES & UTILITIES

- **utils.ts**: Utility functions (cn, formatting, etc.)
- **Tailwind CSS**: Styling
- **shadcn-ui**: Component library (based on Radix UI)

---

## MAPPING TO CHECKLIST SYSTEM

### Integration with Existing Architecture

1. **Prisma Models to Add**:
   - Brand (from BrandPage)
   - Campaign (from LeadGeneration)
   - Lead (from LeadGeneration, CRM)
   - Task (from Execution)
   - Content (from ContentCreation)
   - Strategy (from Strategy, StrategySetup)
   - Offer (from MyOffers)

2. **Pages to Build**:
   - Replace current Dashboard with Loveable version
   - Add Intelligence, LeadGen, Content, CRM, Strategy, Execution, Portfolio, Brand
   - Implement full feature set

3. **UI Components to Implement**:
   - All 49 shadcn-ui components
   - Custom components for marketing

4. **API Routes to Extend**:
   - `/api/leads`
   - `/api/campaigns`
   - `/api/content`
   - `/api/strategy`
   - `/api/automation`
   - `/api/analytics`

---

## IMPLEMENTATION PHASES

### Phase 7: UI Components
- Import all 49 shadcn-ui components
- Build custom marketing components

### Phase 8: Core Pages
- Dashboard redesign
- Add Intelligence, Lead Gen, Content pages

### Phase 9: CRM & Pipeline
- Contact management
- Deal pipeline
- Task management

### Phase 10: Content Engine
- AI content generation
- Multi-channel distribution
- Content calendar

### Phase 11: Strategy & Execution
- Strategy setup wizard
- Automation workflows
- Task execution

### Phase 12: Brand & Portfolio
- Brand guidelines
- Case studies
- Project showcase

---

## ACCEPTANCE CRITERIA

All features from Loveable must be:
- [ ] Documented in issues
- [ ] Added to project board
- [ ] Prioritized by type (FEATURE/ENHANCEMENT/BUG)
- [ ] Implemented in checklist system
- [ ] Aligned with existing architecture

---

## SOURCE QUALITY
Based on: https://github.com/moldovancsaba/mvp-factory-control/issues/498

Every implementation must follow the same quality standard.