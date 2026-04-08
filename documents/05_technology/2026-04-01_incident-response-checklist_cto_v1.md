# Incident Response Checklist

**Title:** Incident Response Checklist
**Owner:** Chief Technology Officer (CTO)
**Purpose:** Standardized procedure for responding to production incidents
**Status:** Active
**Last Updated:** 2026-04-01
**Version:** v1
**Relevant Team:** Technology / Engineering, All Departments
**Source of Request:** CTO Operational Playbook
**Next Review Date:** 2026-05-01

---

## Incident Classification

| Severity | Description | Response Time | Update Frequency |
|----------|-------------|----------------|------------------|
| Critical | Complete outage, data loss, security breach | Immediate | Every 15 minutes |
| High | Major functionality broken | 15 minutes | Every 30 minutes |
| Medium | Partial functionality affected | 1 hour | Hourly |
| Low | Minor issue, workaround available | 4 hours | Every 4 hours |

---

## Phase 1: Detection & Initial Response (0-15 minutes)

### Detection

- [ ] Alert received and acknowledged
- [ ] Issue confirmed (not false positive)
- [ ] Severity determined
- [ ] Incident declared

### Initial Response

- [ ] Incident Commander (IC) assigned
- [ ] Response team notified
- [ ] Communication channel established
- [ ] Initial assessment documented

### First Communication

- [ ] Stakeholders notified of incident
- [ ] Expected resolution time communicated
- [ ] Status page updated (if applicable)
- [ ] Incident ticket created

---

## Phase 2: Investigation & Containment (15 minutes - 1 hour)

### Investigation

- [ ] Root cause identified or narrowed
- [ ] Impact scope determined
- [ ] Affected systems identified
- [ ] Data integrity verified (if applicable)

### Containment

- [ ] Immediate threat contained
- [ ] Affected services isolated
- [ ] Fallback procedures activated
- [ ] Data protected

### Ongoing Communication

- [ ] Status updates sent to stakeholders
- [ ] Status page updated
- [ ] Internal team synchronized

---

## Phase 3: Resolution & Recovery (1-4 hours)

### Resolution

- [ ] Fix implemented
- [ ] Fix tested in staging
- [ ] Deployment plan confirmed

### Recovery

- [ ] Services restored
- [ ] Data integrity confirmed
- [ ] Monitoring intensified
- [ ] All systems verified operational

### Verification

- [ ] Smoke tests passing
- [ ] User-reported issues resolved
- [ ] Performance metrics normal
- [ ] Error rates normal

---

## Phase 4: Post-Incident (After Resolution)

### Immediate (Within 24 hours)

- [ ] Incident closed
- [ ] Final communication sent
- [ ] Stakeholders notified of resolution

### Documentation (Within 48 hours)

- [ ] Incident report created
- [ ] Timeline documented
- [ ] Root cause identified
- [ ] Impact documented

### Follow-Up (Within 1 week)

- [ ] Root cause analysis completed
- [ ] Corrective actions identified
- [ ] Preventative measures implemented
- [ ] Process improvements documented
- [ ] Retrospective held

---

## Incident Commander Responsibilities

1. **Lead Response:** Coordinate all response activities
2. **Communicate:** Keep stakeholders informed
3. **Decide:** Make quick decisions on approach
4. **Document:** Ensure timeline is recorded
5. **Assign:** Delegate tasks to response team

---

## Response Team Roles

| Role | Responsibility |
|------|----------------|
| Incident Commander | Overall response coordination |
| Technical Lead | Technical investigation and fix |
| On-Call Engineer | System monitoring and support |
| Communication Lead | Stakeholder updates |
| Documentation Lead | Timeline and incident record |

---

## Escalation Contacts

| Severity | Escalate To |
|----------|-------------|
| Critical | CEO, CTO immediately |
| High | CTO within 30 minutes |
| Medium | CTO within 1 hour |
| Low | Team lead within 4 hours |

---

## Communication Templates

### Initial Alert
```
[INCIDENT] {Severity} - {Issue Description}
Impact: {Scope}
Investigating: {Actions}
Estimated Resolution: {Time}
Next Update: {Time}
```

### Status Update
```
[UPDATE] {Incident ID} - {Current Status}
What we've done: {Actions taken}
What we're doing: {Current actions}
Next update: {Time}
```

### Resolution
```
[RESOLVED] {Incident ID}
Root Cause: {Brief explanation}
Resolution: {What was done}
Follow-up: {Next steps}
```

---

## Post-Incident Review Checklist

- [ ] Timeline accuracy verified
- [ ] Root cause confirmed
- [ ] Impact properly quantified
- [ ] Corrective actions assigned
- [ ] Preventative actions assigned
- [ ] Documentation complete
- [ ] Team briefed on learnings

---

## Notes

- Never skip post-incident review for any severity
- All incidents must be documented in incident log
- Monthly incident trends analysis required
- Quarterly incident response training required
