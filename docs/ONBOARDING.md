# Checklist + Paperclip Integration

## ONE TASK LOOP (Repeat)

### Step 1: READ
```
GET /api/companies
GET /api/products?companyId={id}
GET /api/customers?companyId={id}
GET /api/competitors?companyId={id}
```

### Step 2: ENRICH
- Research market data
- Collect competitor intelligence
- Find industry trends

### Step 3: LEARN & RECOMMEND NBA
Create NBA with ICE scoring:
```json
{
  "companyId": "uuid",
  "title": "Recommend action",
  "description": "Why this matters",
  "impact": 1-10,
  "confidence": 1-100,
  "ease": 1-10
}
```

### Step 4: WRITE
```
POST /api/nba
```

---

## Feedback Loop (Optional - Makes Brain Smarter)
```
POST /api/feedback
Body: { nbaItemId, action: "ACCEPT" | "DECLINE", annotation }
```

- ACCEPT → +10% to ICE score
- DECLINE → -50% to ICE + save reason

---

## That's It.
1. Read → 2. Enrich → 3. Recommend → 4. Write → Repeat