# Hotfix Checklist

**Title:** Hotfix Checklist
**Owner:** Chief Technology Officer (CTO)
**Purpose:** Standardized checklist for emergency production fixes
**Status:** Active
**Last Updated:** 2026-04-01
**Version:** v1
**Relevant Team:** Technology / Engineering
**Source of Request:** CTO Operational Playbook
**Next Review Date:** 2026-05-01

---

## Definition

A hotfix is an urgent fix that must be deployed immediately to resolve:
- Production outage or critical functionality failure
- Security vulnerability
- Data integrity issue
- Compliance violation

---

## Triage Phase

### Initial Assessment (Must complete within 15 minutes)

- [ ] Issue confirmed and severity assessed
- [ ] Impact scope determined (users, systems, data)
- [ ] Root cause identified or narrowed down
- [ ] Fix approach determined
- [ ] Hotfix team assembled

### Severity Classification

| Severity | Definition | Response Time |
|----------|------------|---------------|
| Critical | Complete system outage, data loss, security breach | Immediate |
| High | Major functionality broken, significant user impact | 1 hour |
| Medium | Minor functionality affected, workaround available | 4 hours |
| Low | Cosmetic issue, minimal impact | Next business day |

---

## Fix Development Phase

### Quick Fix Creation

- [ ] Minimal change that addresses the issue
- [ ] No new features or unrelated changes
- [ ] Fix tested locally
- [ ] Fix reviewed by at least one team member

### Emergency Code Review

- [ ] Reviewer briefed on the issue
- [ ] Code reviewed for correctness and safety
- [ ] Security implications considered
- [ ] Rollback approach verified

---

## Deployment Phase

### Pre-Deployment

- [ ] On-call team notified
- [ ] Communication sent to stakeholders
- [ ] Rollback plan confirmed
- [ ] Deployment window confirmed
- [ ] Monitoring enhanced

### Deployment

- [ ] Hotfix deployed to production
- [ ] Deployment verified successful
- [ ] Health checks passing
- [ ] Smoke tests passing

### Post-Deployment

- [ ] Issue resolved confirmed
- [ ] No new issues introduced
- [ ] Monitoring normal
- [ ] Stakeholders notified of resolution

---

## Post-Fix Phase

### Documentation (Within 24 hours)

- [ ] Incident report created
- [ ] Root cause documented
- [ ] Fix explanation documented
- [ ] Lessons learned captured

### Follow-Up (Within 1 week)

- [ ] Proper fix implemented (if temporary fix)
- [ ] Tests added to prevent regression
- [ ] Process improvements identified
- [ ] Retrospective held

---

## Hotfix Team Roles

| Role | Responsibility |
|------|----------------|
| Lead Developer | Fix development and deployment |
| Reviewer | Code review and approval |
| On-Call Engineer | System monitoring and support |
| Communication Lead | Stakeholder updates |

---

## Quick Reference Commands

```bash
# Emergency rollback
git revert <commit>
git push --force

# Quick deployment
npm run deploy:hotfix

# Health check
curl https://production/health
```

---

## Notes

- Hotfixes bypass normal release process but must follow this checklist
- Any bypass of checklist steps must be documented and justified
- All hotfixes require post-incident review
- Critical hotfixes may require CEO escalation
