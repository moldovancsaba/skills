# MVP Delivery Plan

## Mission
Build an AI-powered marketing checklist that provides 3 next best actions with feedback learning.

## MVP Path (In Order)

### Phase 1: Database Connection (Issue #31)
- [ ] Connect Neon PostgreSQL
- [ ] Run Prisma migrations
- [ ] Test API endpoints

### Phase 2: Data Collection (Issue #34) 
- [ ] Products input form
- [ ] Customers input form
- [ ] Competitors input form

### Phase 3: NBA Display (Issue #32)
- [ ] Fetch from /api/nba
- [ ] Show top 3 on dashboard
- [ ] Accept/Decline buttons

### Phase 4: Feedback System (Issue #33)
- [ ] Accept saves Feedback(ACCEPT)
- [ ] Decline saves Feedback(DECLINE) + annotation
- [ ] Store iceImpact for learning
- [ ] API endpoint works

### Phase 5: Paperclip Integration (Issue #35)
- [ ] Document API endpoints for Paperclip
- [ ] Document how to read/write local DB
- [ ] Document feedback learning requirements
- [ ] Connect Paperclip agents

## Dependencies
- Issue #31 must complete before #34, #32, #33
- Issue #33 must complete before #35

## Features Ready (UI skeleton with "Coming soon")
- Dashboard
- Strategy
- Intelligence  
- Portfolio
- Brand
- Content
- Leads
- CRM
- Pre-Fortitude