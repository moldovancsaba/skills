# Checklist Onboarding Task for Paperclip CEO

## Your Mission
Prepare your company to use the Checklist AI marketing system.

---

## Step 1: Set Up Your Company (5 min)
1. Go to: https://checklist.sovereignsquad.com
2. Click **Set Up Company**
3. Enter your company name and industry

---

## Step 2: Add Your First Data (10 min)
**Why:** The brain needs data to generate recommendations.

Go to `/data` and add:

| Type | Example |
|------|---------|
| **Products** | "Elite Training Program", "Group Sessions", "Summer Camp" |
| **Customers** | "Youth Soccer Parents", "Club Teams", "Recreational Players" |
| **Competitors** | "Chronis Elite", "TSF Academy", "Sofive"

Add at least 3-5 of each type.

---

## Step 3: Generate Recommendations (2 min)
1. Go to Dashboard
2. Click **Generate** button
3. Review the 3 Next Best Actions

---

## Step 4: Give Feedback (5 min)
For each recommendation:
- Click ✓ to **ACCEPT** → trains the brain
- Click ✗ to **DECLINE** → provides feedback for improvement

**Every feedback counts!**

---

## API Integration (For Technical Team)

### Connect Paperclip to Checklist

**Read endpoints** (Paperclip → local DB):
```
GET https://checklist.sovereignsquad.com/api/companies
GET https://checklist.sovereignsquad.com/api/products?companyId={id}
GET https://checklist.sovereignsquad.com/api/customers?companyId={id}
GET https://checklist.sovereignsquad.com/api/competitors?companyId={id}
GET https://checklist.sovereignsquad.com/api/nba?companyId={id}
```

**Write endpoints** (Paperclip → create recommendations):
```
POST https://checklist.sovereignsquad.com/api/nba
Body: { companyId, title, description, impact, confidence, ease }
```

**Feedback endpoint** (Paperclip → learning):
```
POST https://checklist.sovereignsquad.com/api/feedback
Body: { nbaItemId, action: "ACCEPT" | "DECLINE", annotation }
```

---

## Support
- Docs: https://github.com/sovereignsquad/checklist/blob/main/docs/PAPERCLIP-INTEGRATION.md
- Issues: https://github.com/sovereignsquad/checklist/issues