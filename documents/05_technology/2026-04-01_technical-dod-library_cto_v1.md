# Technical Definition of Done Library

**Title:** Technical Definition of Done Library
**Owner:** Chief Technology Officer (CTO)
**Purpose:** Comprehensive library of "done" criteria for different types of technical work
**Status:** Active
**Last Updated:** 2026-04-01
**Version:** v1
**Relevant Team:** Technology / Engineering
**Source of Request:** CTO Operational Playbook
**Next Review Date:** 2026-05-01

---

## Overview

This library defines "done" criteria for different categories of technical work. Technical work is not done unless ALL criteria are met.

---

## 1. General Technical Work

### Universal Done Criteria

- [ ] Implementation is complete
- [ ] Required review is complete
- [ ] Required testing or validation is complete
- [ ] Documentation is updated
- [ ] Release or deployment path is clear
- [ ] Change is logged
- [ ] Risks and rollback implications documented (where relevant)
- [ ] Support implications documented
- [ ] Dependent stakeholders informed
- [ ] Artefacts stored in approved location

### What "Done" Is NOT

- "I finished my part"
- "It exists somewhere"
- "I told someone verbally"
- "The file is on my desktop"
- "The team probably knows"
- "I thought someone else would update the document"
- "It is basically done"

---

## 2. Feature Development

### Requirements Phase

- [ ] Acceptance criteria documented
- [ ] Technical approach defined
- [ ] Dependencies identified
- [ ] Effort estimated
- [ ] Test strategy defined

### Implementation Phase

- [ ] Code written according to standards
- [ ] Unit tests written
- [ ] Integration tests written (if applicable)
- [ ] Code review completed
- [ ] Security review completed (if applicable)
- [ ] Performance considerations addressed

### Testing Phase

- [ ] All tests passing
- [ ] Code coverage meets threshold (80%)
- [ ] QA sign-off received
- [ ] UAT completed (if applicable)
- [ ] Performance tests passed (if applicable)
- [ ] Security tests passed

### Deployment Phase

- [ ] Deployable artifact created
- [ ] Release notes written
- [ ] Rollback plan documented
- [ ] Feature flags configured
- [ ] Monitoring in place
- [ ] Deployed to staging
- [ ] Staging validation complete
- [ ] Deployed to production
- [ ] Production verification complete

### Closure Phase

- [ ] Documentation updated
- [ ] Stakeholders notified
- [ ] Post-deployment monitoring confirmed
- [ ] Retrospective scheduled (if major feature)

---

## 3. Bug Fix

### Triage Phase

- [ ] Bug confirmed and reproducible
- [ ] Severity classified
- [ ] Root cause identified

### Fix Phase

- [ ] Fix implemented
- [ ] Tests added to prevent regression
- [ ] Code review completed

### Validation Phase

- [ ] Original bug fixed
- [ ] No regression in related functionality
- [ ] Tests passing

### Closure Phase

- [ ] Fix deployed to production
- [ ] Documentation updated
- [ ] QA verification received

---

## 4. Infrastructure Change

### Planning Phase

- [ ] Change documented
- [ ] Risk assessment completed
- [ ] Rollback plan documented
- [ ] Downtime window defined (if applicable)
- [ ] Stakeholders notified

### Implementation Phase

- [ ] Changes applied to non-production first
- [ ] Changes validated
- [ ] Monitoring enhanced
- [ ] Applied to production

### Validation Phase

- [ ] Systems operational
- [ ] Monitoring showing normal metrics
- [ ] No alerts triggered
- [ ] Functionality verified

### Closure Phase

- [ ] Documentation updated
- [ ] Post-change monitoring confirmed (24 hours)
- [ ] Stakeholders notified

---

## 5. Documentation

### Creation

- [ ] Required sections present
- [ ] Naming convention followed
- [ ] Metadata complete
- [ ] Examples provided
- [ ] Owner assigned
- [ ] Review cycle defined
- [ ] Saved to correct location

### Update

- [ ] Changes tracked
- [ ] Version incremented
- [ ] Review completed
- [ ] Stakeholders notified
- [ ] Index updated

---

## 6. Release

### Pre-Release

- [ ] Code complete
- [ ] All tests passing
- [ ] Code review complete
- [ ] QA sign-off received
- [ ] Documentation updated
- [ ] Release notes written

### Deployment

- [ ] Staging deployment successful
- [ ] Staging validation complete
- [ ] Production deployment successful
- [ ] Production smoke tests passing

### Post-Release

- [ ] Monitoring normal
- [ ] No error spikes
- [ ] Stakeholders notified
- [ ] Deployment logged

---

## 7. Incident Response

### During Incident

- [ ] Incident detected and acknowledged
- [ ] Severity classified
- [ ] Response team assembled
- [ ] Communication sent
- [ ] Incident contained

### Resolution

- [ ] Service restored
- [ ] Root cause identified
- [ ] Fix implemented and verified
- [ ] Systems operational

### Post-Incident

- [ ] Incident report created
- [ ] Root cause analysis complete
- [ ] Corrective actions identified
- [ ] Follow-up scheduled

---

## 8. Security Work

### Implementation

- [ ] Security requirements met
- [ ] Security tests passing
- [ ] Code review with security focus
- [ ] Vulnerability scan clean

### Validation

- [ ] Penetration testing passed (if required)
- [ ] Security review approved

### Deployment

- [ ] Deployable artifact created
- [ ] Monitoring in place
- [ ] Deployed to production
- [ ] Security verification complete

---

## 9. Technical Debt

### Categorization

- [ ] Impact assessed
- [ ] Effort estimated
- [ ] Priority assigned
- [ ] Scheduled for resolution

### Resolution

- [ ] Improvement implemented
- [ ] Tests added
- [ ] Code reviewed
- [ ] Deployed

### Verification

- [ ] Improvement verified
- [ ] Documentation updated
- [ ] Debt marked as resolved

---

## Quick Reference: Universal Done Checklist

For any technical work, verify these 12 points:

1. ✅ Implementation is complete
2. ✅ Required review is complete
3. ✅ Required testing or validation is complete
4. ✅ Documentation is updated
5. ✅ Release or deployment path is clear
6. ✅ Change is logged
7. ✅ Risks and rollback implications documented (where relevant)
8. ✅ Support implications documented
9. ✅ Dependent stakeholders informed
10. ✅ Artefacts stored in approved location
11. ✅ The output is in the correct location
12. ✅ Ownership is clear

---

## Notes

- All criteria must be met before marking work as complete
- Document any exceptions or incomplete items
- Update this library quarterly
- Train new team members on these criteria
