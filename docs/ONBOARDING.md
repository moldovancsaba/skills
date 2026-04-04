# Checklist Integration - Exact Technical Details

## DEPLOYMENT URL
```
https://checklist.sovereignsquad.com
```

## LOCAL DATABASE (PostgreSQL)
```
HOST: ep-patient-fire-alygo1nb-pooler.c-3.eu-central-1.aws.neon.tech
PORT: 5432
DATABASE: neondb
USER: neondb_owner
PASSWORD: npg_cT45qFYrdiSl
SSL: require
```

**Full Connection String:**
```
postgresql://neondb_owner:npg_cT45qFYrdiSl@ep-patient-fire-alygo1nb-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

---

## API ENDPOINTS (Exact URLs)

### 1. READ - Companies
```
GET https://checklist.sovereignsquad.com/api/companies
```
Returns: Array of all companies with their products, customers, competitors, pending NBA

---

### 2. READ - Products
```
GET https://checklist.sovereignsquad.com/api/products?companyId=UUID-HERE
```
Parameter: `companyId` (query string)
Returns: Array of products for that company

---

### 3. READ - Customers
```
GET https://checklist.sovereignsquad.com/api/customers?companyId=UUID-HERE
```
Parameter: `companyId` (query string)
Returns: Array of customers for that company

---

### 4. READ - Competitors
```
GET https://checklist.sovereignsquad.com/api/competitors?companyId=UUID-HERE
```
Parameter: `companyId` (query string)
Returns: Array of competitors for that company

---

### 5. READ - NBA (Existing Recommendations)
```
GET https://checklist.sovereignsquad.com/api/nba?companyId=UUID-HERE
```
Parameter: `companyId` (query string)
Returns: Array of NBA items sorted by ICE score (highest first)

---

### 6. READ - Feedback (Annotations from Webapp)
```
GET https://checklist.sovereignsquad.com/api/feedback?nbaItemId=UUID-HERE
```
Parameter: `nbaItemId` (query string)
Returns: Array of feedback/annotations for that NBA item

**OR get ALL feedback:**
```
GET https://checklist.sovereignsquad.com/api/feedback
```

**Feedback Response Format:**
```json
[
  {
    "id": "fb-uuid-001",
    "nbaItemId": "nba-uuid-001",
    "action": "ACCEPT",
    "annotation": null,
    "iceImpact": 10,
    "createdAt": "2024-03-15T14:30:00Z"
  },
  {
    "id": "fb-uuid-002",
    "nbaItemId": "nba-uuid-002", 
    "action": "DECLINE",
    "annotation": "Already have email marketing in place",
    "iceImpact": -50,
    "createdAt": "2024-03-16T09:15:00Z"
  }
]
```

**Feedback Table Fields:**
| Field | Type | Description |
|-------|------|-----------|
| id | UUID | Feedback ID |
| nbaItemId | UUID | The NBA item this feedback is for |
| action | string | "ACCEPT" or "DECLINE" |
| annotation | string or null | User's reason/comment |
| iceImpact | integer | +10 (accept) or -50 (decline) |
| createdAt | timestamp | When feedback was given |

---

### 7. READ - NBA with User Annotations (Decline Reasons)
```
GET https://checklist.sovereignsquad.com/api/nba?companyId=UUID-HERE
```

**NBA Response includes userAnnotation (decline reasons):**
```json
[
  {
    "id": "nba-001",
    "title": "Launch email campaign",
    "description": "...",
    "iceScore": 420,
    "status": "DECLINED",
    "userAnnotation": "Already have email marketing in place",
    "impact": 8,
    "confidence": 75,
    "ease": 7,
    "createdAt": "2024-03-01T12:00:00Z"
  },
  {
    "id": "nba-002",
    "title": "Create referral program", 
    "description": "...",
    "iceScore": 350,
    "status": "ACCEPTED",
    "userAnnotation": null,
    "impact": 7,
    "confidence": 70,
    "ease": 7,
    "createdAt": "2024-03-10T08:00:00Z"
  }
]
```

**NBA Status Values:**
| Status | Meaning |
|--------|--------|
| PENDING | Not yet responded |
| ACCEPTED | User clicked ✓ |
| DECLINED | User clicked ✗ (has annotation) |

---

### 8. WRITE - Create NBA
```
POST https://checklist.sovereignsquad.com/api/nba
Content-Type: application/json
```

**Request Body (exact JSON):**
```json
{
  "companyId": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Launch summer camp promotion",
  "description": "Create limited-time offer for existing customers",
  "impact": 8,
  "confidence": 70,
  "ease": 8
}
```

**Required Fields:**
| Field | Type | Range |
|-------|------|-------|
| companyId | string (UUID) | Valid company UUID |
| title | string | Recommendation title |
| description | string | Optional description |
| impact | integer | 1-10 |
| confidence | integer | 1-100 |
| ease | integer | 1-10 |

---

### 9. WRITE - Feedback (Optional)
```
POST https://checklist.sovereignsquad.com/api/feedback
Content-Type: application/json
```

**Request Body - Accept:**
```json
{
  "nbaItemId": "NBA-UUID-HERE",
  "action": "ACCEPT"
}
```

**Request Body - Decline:**
```json
{
  "nbaItemId": "NBA-UUID-HERE", 
  "action": "DECLINE",
  "annotation": "Reason for declining"
}
```

---

## DATABASE TABLES

| Table | Description |
|-------|-----------|
| Company | Your company profile |
| Product | Your products/services |
| Customer | Customer data |
| Competitor | Competitor info |
| NBAItem | AI recommendations |
| Feedback | Accept/decline feedback + annotations |

---

## EXECUTION (Copy-Paste)

### Python Example
```python
import requests
import json

BASE = "https://checklist.sovereignsquad.com/api"

# 1. READ companies
companies = requests.get(f"{BASE}/companies").json()

# 2. READ data for each company
for co in companies:
    company_id = co["id"]
    products = requests.get(f"{BASE}/products?companyId={company_id}").json()
    customers = requests.get(f"{BASE}/customers?companyId={company_id}").json()
    competitors = requests.get(f"{BASE}/competitors?companyId={company_id}").json()
    
    # 3. READ feedback/annotations (THIS IS THE LEARNING DATA!)
    all_feedback = requests.get(f"{BASE}/feedback").json()
    nba_items = requests.get(f"{BASE}/nba?companyId={company_id}").json()
    
    # Filter accepted recommendations
    accepted = [n for n in nba_items if n["status"] == "ACCEPTED"]
    
    # Filter declined with reasons
    declined = [n for n in nba_items if n["status"] == "DECLINED"]
    decline_reasons = [n["userAnnotation"] for n in declined if n["userAnnotation"]]
    
    # 4. ENRICH - do your research here using feedback!
    # ...
    
    # 5. WRITE NBA
    nba = {
        "companyId": company_id,
        "title": "Your recommendation",
        "description": "Why this matters",
        "impact": 8,
        "confidence": 75,
        "ease": 7
    }
    result = requests.post(f"{BASE}/nba", json=nba).json()
```

### cURL Examples
```bash
# Read products
curl "https://checklist.sovereignsquad.com/api/products?companyId=550e8400-e29b-41d4-a716-446655440000"

# Read all feedback/annotations
curl "https://checklist.sovereignsquad.com/api/feedback"

# Read NBA for company (includes ACCEPTED/DECLINED status)
curl "https://checklist.sovereignsquad.com/api/nba?companyId=550e8400-e29b-41d4-a716-446655440000"

# Create NBA
curl -X POST "https://checklist.sovereignsquad.com/api/nba" \
  -H "Content-Type: application/json" \
  -d '{"companyId":"550e8400-e29b-41d4-a716-446655440000","title":"Test","impact":8,"confidence":75,"ease":7}'
```

---

## THE LOOP - CRITICAL

**THIS IS HOW YOU LEARN FROM OUR WEBAPP:**

1. User sees NBA recommendation on dashboard
2. User clicks ✓ (ACCEPT) → stored as ACCEPTED status
3. User clicks ✗ (DECLINED) → enters reason → stored as DECLINED + annotation
4. **YOU read the feedback to learn!**

**READ feedback endpoint gives you:**
- All ACCEPTED items → do more of these
- All DECLINED items + reasons → don't do these / change approach
- Patterns in userAnnotation → real business intelligence

---

## ICE SCORE CALCULATION
```
ICE = Impact × (Confidence / 100) × Ease × 10
```

Example: Impact=8, Confidence=75, Ease=7
ICE = 8 × 0.75 × 7 × 10 = **420**