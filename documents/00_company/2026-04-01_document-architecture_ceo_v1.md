# Documentation Architecture

**Title:** {checklist} — Documentation Architecture
**Owner:** CEO
**Purpose:** Define the approved folder structure and intent for all company documentation.
**Status:** Approved
**Last Updated:** 2026-04-01
**Relevant Team:** Company-wide
**Source of Request:** Owner — CEO Operating Pack
**Linked Workflow:** CEO Operating Playbook
**Definition of Done:** Structure is defined and created.
**Next Review:** 2026-07-01

---

## Approved Directory Structure

```
/Projects/checklist/documents/
├── 00_company/        — Company-wide rules, identity, governance, and operating standards.
├── 01_strategy/       — Top-level priorities, goals, metrics, and strategic direction.
├── 02_product/        — The product itself, requirements, research, product decisions, and checklist content assets.
├── 03_marketing/      — Positioning, campaigns, channels, messaging, and growth reporting.
├── 04_customer/       — Client-facing delivery, onboarding, support, account management, and feedback.
├── 05_technology/     — Systems, engineering rules, environments, architecture, release, and incident management.
├── 06_operations/     — Cross-functional rules, workflows, decisions, governance processes, and operational control.
├── 07_people/         — Org design, role expectations, training, onboarding, and people operations.
├── 08_templates/      — All approved company templates.
└── 09_archive/        — Approved archive for obsolete, replaced, or retired material.
```

## Single Source of Truth Rule

No official company documentation may live outside /Users/moldovancsaba/Projects/checklist/documents unless explicitly approved by the CEO or delegate.

## Archive Rule

Outdated documents must be archived, not casually deleted. The company must be able to track what changed and what used to be official.

## Document Naming Standard

Format: `YYYY-MM-DD_topic_owner_version.md`

Example: `2026-03-31_weekly-client-delivery_cco_v1.md`

### Naming Rules

Names must be:
- descriptive
- short enough to scan
- consistent
- lower friction for search
- not dependent on personal shorthand

Avoid:
- final-final-v2-reallyfinal
- notes
- new doc
- untitled
- my version

## Required Document Fields

Every official document must contain:
- Title
- Owner
- Purpose
- Status
- Last Updated Date
- Relevant Team or Function
- Source of Request or Business Context
- Linked Workflow or Checklist
- Definition of Done
- Related Dependencies
- Next Review Date (where applicable)

## Approved Status Values

- Draft
- In Review
- Approved
- Active
- Superseded
- Archived
