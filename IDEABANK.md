# IDEABANK: Marketing Skills Integration

Collecting marketing skills from the ecosystem to power our AI-driven marketing operating system.

## Objective

Build a comprehensive marketing skill library that transforms into NBA (Next Best Action) recommendations for users. Integrate marketingskills from coreyhaines31/marketingskills and other sources into our CHECKLIST.

## Unified Context

Our Marketing OS currently generates NBA items from user-uploaded data (products, customers, competitors) via Paperclip agents. Adding a skill library will enable:

1. **Skill-triggered NBAs**: When user uploads data, system matches relevant skills to generate actions
2. **Guided Workflows**: Users can invoke skills directly to get step-by-step marketing guidance
3. **Quality Templates**: Every marketing task uses best-practice frameworks from proven skills

## Problem

Current gaps:
- No marketing expertise in the system beyond generic AI
- Users get generic advice, not specialized frameworks
- Skills are not connected to user data/context

## Goal

Build Marketing Skill IDEABANK that:
- Adds core skills to our system (SEO, CRO, Copywriting, Email, etc.)
- Creates skill-to-NBA mapping
- Enables user-triggered skill workflows

## Scope

### In Scope
- Integration with coreyhaines31/marketingskills (30+ skills)
- Skill-to-NBA conversion rules
- User-invokable skill commands
- Skill context injection

### Out of Scope
- Paperclip agent setup (covered in Phase 5)
- Local sync (covered in Phase 6)

## Skills to Integrate

### Conversion Optimization
- [ ] page-cro - Any marketing page optimization
- [ ] signup-flow-cro - Registration flows
- [ ] onboarding-cro - Post-signup activation
- [ ] form-cro - Lead capture forms
- [ ] popup-cro - Modals and overlays
- [ ] paywall-upgrade-cro - In-app upgrades

### Content & Copy
- [ ] copywriting - Marketing page copy
- [ ] copy-editing - Edit existing copy
- [ ] cold-email - B2B cold outreach
- [ ] email-sequence - Automated flows
- [ ] social-content - Social media

### SEO & Discovery
- [ ] seo-audit - Technical SEO
- [ ] ai-seo - AI search optimization
- [ ] programmatic-seo - Scaled pages
- [ ] site-architecture - Page hierarchy
- [ ] competitor-alternatives - Comparison pages
- [ ] schema-markup - Structured data

### Paid & Distribution
- [ ] paid-ads - Google, Meta, LinkedIn
- [ ] ad-creative - Bulk creative

### Measurement
- [ ] analytics-tracking - Event tracking
- [ ] ab-test-setup - Experiments

### Retention
- [ ] churn-prevention - Cancel flows, dunning

### Growth
- [ ] free-tool-strategy - Marketing tools
- [ ] referral-program - Referral/affiliate

### Strategy
- [ ] marketing-ideas - 140 SaaS ideas
- [ ] marketing-psychology - Mental models
- [ ] launch-strategy - Product launches
- [ ] pricing-strategy - Pricing

### Sales
- [ ] revops - Lead lifecycle
- [ ] sales-enablement - Sales collateral

### Research
- [ ] customer-research - VOC, personas
- [ ] product-marketing-context - Context document

## Acceptance Checks
- [x] CHECKLIST Trinity Engine (Drafter, Writer, Judge) Operational
- [x] Passive Ingress Architecture (Thin Webapp / Authoritative Worker)
- [x] Fair Orbit Rotation & AI Resilience
- [x] Intelligence Specialization: Positive Feedback Replay
- [x] Skill Selection Logic (CRO, SEO, Strategy)
- [x] Production Hardening (Mantine-First & Metadata Filtering)
- [ ] Skills available in IDEABANK (Phase 2)
- [ ] Skill can be triggered by user command
- [ ] Skill generates relevant NBA
- [ ] Skill uses proper context

## Dependencies
- Phase 5: Paperclip Agents

## Quality Standard

Based on: https://github.com/moldovancsaba/mvp-factory-control/issues/498

Every skill integration must include:
- When to use the skill
- What inputs needed
- Expected outputs
- Related skills
- Framework steps