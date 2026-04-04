# Checklist Database - Technical Guide for Paperclip

## DEPLOYMENT URL
```
https://checklist.messmass.com
```

---

## Or Use API (Recommended)
```
DATABASE_URL=postgresql://user:pass@host.neon.tech/checklist?sslmode=require
```

**Get your connection string from:**
1. Go to https://console.neon.tech
2. Select your project
3. Copy connection string from Dashboard

---

## Or Use API (Recommended)

Base URL: `https://checklist-[app-name].vercel.app/api`

### 2a. READ Input - What Paperclip Pulls

#### All Companies
```http
GET /api/companies
```
**Response:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Your Company",
    "industry": "Youth Sports",
    "description": "Soccer training academy",
    "targetMarket": "Ages 6-14, NY Metro",
    "mainGoal": "GROW_REVENUE",
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

#### Products by Company
```http
GET /api/products?companyId=550e8400-e29b-41d4-a716-446655440000
```
**Response:**
```json
[
  {
    "id": "prod-001",
    "name": "Elite Training Program",
    "description": "Premium soccer training",
    "pricing": "$150/month",
    "features": ["Weekly sessions", "Video analysis"],
    "urls": ["https://..."],
    "createdAt": "2024-01-15T00:00:00Z"
  }
]
```

#### Customers by Company  
```http
GET /api/customers?companyId=550e8400-e29b-41d4-a716-446655440000
```
**Response:**
```json
[
  {
    "id": "cust-001",
    "name": "John Doe",
    "email": "john@example.com",
    "segments": ["Elite", "U12"],
    "painPoints": ["Time constraints"],
    "channels": ["Referral"],
    "lifetimeValue": 1800.00,
    "createdAt": "2024-02-01T00:00:00Z"
  }
]
```

#### Competitors by Company
```http
GET /api/competitors?companyId=550e8400-e29b-41d4-a716-446655440000
```
**Response:**
```json
[
  {
    "id": "comp-001",
    "name": "Chronis Elite",
    "urls": ["https://chroniselite.com"],
    "pricing": "$200/month",
    "strengths": ["MLS connections"],
    "weaknesses": ["Expensive"],
    "positioning": "High-end academy"
  }
]
```

#### Existing NBA (to avoid duplicates)
```http
GET /api/nba?companyId=550e8400-e29b-41d4-a716-446655440000
```
**Response:**
```json
[
  {
    "id": "nba-001",
    "title": "Launch email campaign",
    "description": "Send targeted emails to warm leads",
    "iceScore": 56.0,
    "status": "PENDING",
    "impact": 8,
    "confidence": 75,
    "ease": 7
  }
]
```

---

### 3a. LEARN - How to Score NBA

**ICE Formula:**
```
ICE = Impact × (Confidence / 100) × Ease × 10
```

| Factor | Range | Description |
|--------|-------|------------|
| Impact | 1-10 | Revenue/growth potential |
| Confidence | 1-100 | % sure it'll work |
| Ease | 1-10 | How easy to implement |

**Example:**
- Impact: 8 (high revenue potential)
- Confidence: 75% (pretty sure)
- Ease: 7 (moderate effort)
- ICE = 8 × 0.75 × 7 × 10 = **420**

---

### 4a. WRITE - Output Format Paperclip Writes

#### Create NBA Recommendation
```http
POST /api/nba
Content-Type: application/json
```

**Request Body:**
```json
{
  "companyId": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Launch summer camp promotion",
  "description": "Create urgency with limited-time offer for existing customer database",
  "impact": 8,
  "confidence": 70,
  "ease": 8
}
```

**Response (created):**
```json
{
  "id": "nba-new-001",
  "companyId": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Launch summer camp promotion",
  "description": "Create urgency with limited-time offer for existing customer database",
  "impact": 8,
  "confidence": 70,
  "ease": 8,
  "iceScore": 448.0,
  "status": "PENDING",
  "createdAt": "2024-03-01T12:00:00Z"
}
```

---

### Optional: Write Feedback

```http
POST /api/feedback
Content-Type: application/json
```

**Request Body (Accept):**
```json
{
  "nbaItemId": "nba-001",
  "action": "ACCEPT"
}
```

**Request Body (Decline with reason):**
```json
{
  "nbaItemId": "nba-001", 
  "action": "DECLINE",
  "annotation": "Already have email marketing in place"
}
```

---

## Summary

| Action | Endpoint | Method | Body |
|--------|---------|--------|-----|
| Read company | /api/companies | GET | - |
| Read products | /api/products?companyId={id} | GET | - |
| Read customers | /api/customers?companyId={id} | GET | - |
| Read competitors | /api/competitors?companyId={id} | GET | - |
| Read NBA | /api/nba?companyId={id} | GET | - |
| Write NBA | /api/nba | POST | {companyId, title, description, impact, confidence, ease} |
| Write feedback | /api/feedback | POST | {nbaItemId, action, annotation?} |

---

## Environment
```
# For Vercel deployment:
DATABASE_URL=postgresql://... (neon.tech)

# For local development:
DATABASE_URL=postgresql://localhost:5432/checklist
```