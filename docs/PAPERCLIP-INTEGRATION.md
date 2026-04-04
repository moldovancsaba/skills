# Checklist + Paperclip Integration

## Overview
The Checklist app uses Paperclip as an automated AI marketing machine to generate Next Best Actions (NBA). This document describes how to integrate with Paperclip.

---

## Local Database Schema (PostgreSQL via Prisma)

### Tables

| Table | Purpose |
|-------|---------|
| `Company` | Your company profile |
| `Product` | Your products/services |
| `Customer` | Customer data and segments |
| `Competitor` | Competitor information |
| `NBAItem` | AI-generated recommendations |
| `Feedback` | User feedback on NBAs |

### Schema Location
`prisma/schema.prisma`

---

## API Endpoints (For Paperclip to Read)

### 1. GET /api/companies
Returns your company profile.

```
Response: [{ id, name, industry, description, targetMarket, mainGoal }]
```

### 2. GET /api/products?companyId={id}
Returns your products/services.

```
Response: [{ id, name, description, pricing, features[], urls[] }]
```

### 3. GET /api/customers?companyId={id}
Returns customer data.

```
Response: [{ id, name, email, segments[], painPoints[], channels[], lifetimeValue }]
```

### 4. GET /api/competitors?companyId={id}
Returns competitor data.

```
Response: [{ id, name, urls[], pricing, strengths[], weaknesses[], positioning }]
```

### 5. GET /api/nba?companyId={id}
Returns NBA recommendations sorted by ICE score (descending).

```
Response: [{ id, title, description, iceScore, status, impact, confidence, ease }]
```

### 6. GET /api/feedback?nbaItemId={id}
Returns feedback history for an NBA item.

```
Response: [{ id, action, annotation, iceImpact, createdAt }]
```

---

## API Endpoints (For Paperclip to Write)

### 1. POST /api/nba
Create a new NBA recommendation (Paperclip generates these).

**Request:**
```json
{
  "companyId": "uuid",
  "title": "Launch email campaign for Q2 leads",
  "description": "Send targeted emails to warm leads",
  "impact": 8,
  "confidence": 75,
  "ease": 7
}
```

**Response:** Created NBA item with ICE score.

### 2. POST /api/feedback
Log user accept/decline decisions (for learning).

**Request:**
```json
{
  "nbaItemId": "uuid",
  "action": "ACCEPT",  // or "DECLINE"
  "annotation": "Already have this in place"
}
```

**Response:** Created feedback record.

---

## Learning System - How Feedback Works

### Accept Flow
```
1. User clicks ✓ (Accept)
2. POST /api/feedback with action: "ACCEPT"
3. NBA item status → "ACCEPTED"
4. iceScore increases by 10% (reward learning)
5. Future NBAs ranked higher
```

### Decline Flow
```
1. User clicks ✗ (Decline)  
2. Modal asks for annotation
3. POST /api/feedback with action: "DECLINE" + annotation
4. NBA item status → "DECLINED"
5. iceScore decreases by 50% (learning)
6. Annotation saved for model improvement
```

### Feedback Improves AI
- **ACCEPT**: +10% to ICE score
- **DECLINE**: -50% to ICE score + store reason
- Every feedback trains the model

---

## Paperclip Agent Integration Guide

### Recommended Workflow

1. **Read Data**: Paperclip calls GET endpoints to read company, products, customers, competitors
2. **Generate NBAs**: Paperclip calls POST /api/nba to create recommendations
3. **Read NBAs**: Dashboard fetches and displays top 3
4. **User Feedback**: User accepts/declines
5. **Learning**: Feedback loop improves future NBAs

### Environment Variables Needed
```
DATABASE_URL=postgresql://... (provided by Checklist)
```

### Base URL for API Calls
```
https://checklist-[your-app]..vercel.app/api
```

---

## ICE Scoring Formula

```
ICE Score = Impact × (Confidence / 100) × Ease × 10
```

- **Impact** (1-10): How much revenue/growth
- **Confidence** (1-100): % sure it will work  
- **Ease** (1-10): How easy to implement

---

## Webhooks (Future)

When NBA is created, Paperclip can receive webhook:
```
POST https://your-paperclip-agent.com/webhook/nba
{
  "title": "...",
  "description": "...",
  "iceScore": 56.0
}
```

---

## Support
- GitHub Issues: https://github.com/sovereignsquad/checklist/issues
- Paperclip Docs: https://docs.paperclip.dev