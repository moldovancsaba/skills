# Product Workflow & Stage Gates

**Title:** {checklist} — Product Workflow & Stage Gates  
**Owner:** CPO  
**Purpose:** Define the workflow for product work including stage gates and approval points.  
**Status:** Approved  
**Last Updated:** 2026-04-01  
**Relevant Team:** Product, Technology, Customer, Marketing  
**Source of Request:** CPO Operating Pack  
**Linked Workflow:** Product Planning Workflow  
**Definition of Done:** Workflow documented, communicated, and enforced.  
**Next Review:** 2026-07-01  

---

## Workflow Overview

```
Stage 1: Discovery    → Stage 2: Definition    → Stage 3: Development    → Stage 4: Release
Signal & Research     Requirements & Prioritization    Build & Test         Deploy & Validate
```

---

## Stage 1: Discovery

**Purpose:** Capture customer signal and validate problems.

| Gate | Criteria | Owner | Approver |
|------|----------|-------|----------|
| G1.1 | Signal captured and logged | Product | - |
| G1.2 | Problem validated (confirmed real) | Product | CPO |
| G1.3 | Target user identified | Product | CPO |

**Output:** Problem statement document

---

## Stage 2: Definition

**Purpose:** Document requirements and get approval to build.

| Gate | Criteria | Owner | Approver |
|------|----------|-------|----------|
| G2.1 | Requirement documented with template | Product | - |
| G2.2 | Acceptance criteria explicit (≥3) | Product | CPO |
| G2.3 | Technology feasibility confirmed | Technology | Tech Lead |
| G2.4 | Priority assigned | Product | CPO |
| G2.5 | Customer/Marketing impact assessed | Product | CPO |
| G2.6 | Decision logged | Product | CPO |

**Output:** Approved requirement (REQ-XXX)

---

## Stage 3: Development

**Purpose:** Build and test the solution.

| Gate | Criteria | Owner | Approver |
|------|----------|-------|----------|
| G3.1 | Work item in development tracker | Technology | - |
| G3.2 | Code complete | Technology | Tech Lead |
| G3.3 | Tests passing | Technology | Tech Lead |
| G3.4 | Acceptance criteria verified | Product | CPO |
| G3.5 | Code review complete | Technology | Tech Lead |

**Output:** Tested increment ready for release

---

## Stage 4: Release

**Purpose:** Deploy and validate with customers.

| Gate | Criteria | Owner | Approver |
|------|----------|-------|----------|
| G4.1 | Release Readiness Checklist complete | Product | CPO |
| G4.2 | Customer readiness confirmed | Customer | CCO |
| G4.3 | Marketing readiness confirmed (if applicable) | Marketing | CMO |
| G4.4 | Release deployed | Technology | Tech Lead |
| G4.5 | Post-release monitoring complete | Technology/Product | CPO |

**Output:** Released product to customers

---

## Stage Gate Roles

| Role | Stage 1 | Stage 2 | Stage 3 | Stage 4 |
|------|---------|---------|---------|---------|
| Product | G1.1, G1.2, G1.3 | G2.1, G2.2, G4.1 | G3.4 | G4.1 |
| Technology | - | G2.3 | G3.1, G3.2, G3.3, G3.5 | G4.4 |
| Customer | G1.2 | G2.5 | - | G4.2 |
| Marketing | - | G2.5 | - | G4.3 |
| CPO | G1.2, G1.3 | G2.2, G2.4, G2.5, G2.6 | G3.4 | G4.1, G4.5 |

---

## Workflow Rules

1. No work proceeds without passing the preceding gate
2. Rejected items return to previous stage with feedback
3. Escalation to CEO for P0 items or stage gate disputes
4. All decisions logged in Product Decision Log
