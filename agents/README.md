# Paperclip Agent Configurations

This directory contains the agent configurations for the Marketing OS.

## Agents to Create

### 1. Marketing Orchestrator (CTO)
Reports to: CEO (your main agent)

```json
{
  "name": "Marketing Orchestrator",
  "role": "marketing_orchestrator", 
  "title": "Chief Marketing Officer",
  "icon": "brain",
  "adapterType": "codex_local",
  "adapterConfig": {
    "model": "o4-mini",
    "cwd": "./checklist-local"
  },
  "capabilities": "Owns marketing strategy, coordinates specialists, generates NBAs"
}
```

### 2. Product Specialist
Reports to: Marketing Orchestrator

```json
{
  "name": "Product Specialist",
  "role": "product_specialist",
  "title": "Product Marketing Specialist",
  "icon": "package",
  "adapterType": "codex_local",
  "adapterConfig": {
    "model": "o4-mini"
  },
  "capabilities": "Analyzes products, identifies gaps, recommends improvements"
}
```

### 3. Customer Specialist
Reports to: Marketing Orchestrator

```json
{
  "name": "Customer Specialist", 
  "role": "customer_specialist",
  "title": "Customer Insights Analyst",
  "icon": "users",
  "adapterType": "codex_local",
  "adapterConfig": {
    "model": "o4-mini"
  },
  "capabilities": "Analyzes customer data, identifies segments, finds insights"
}
```

### 4. Competitor Specialist
Reports to: Marketing Orchestrator

```json
{
  "name": "Competitor Specialist",
  "role": "competitor_specialist", 
  "title": "Competitive Intelligence Agent",
  "icon": "search",
  "adapterType": "codex_local",
  "adapterConfig": {
    "model": "o4-mini"
  },
  "capabilities": "Monitors competitors, analyzes positioning, flags threats"
}
```

## Agent Communication Flow

1. User uploads data (products, customers, competitors)
2. Specialists analyze their respective domains
3. Orchestrator synthesizes and generates 3 NBA items
4. User sees NBA checklist and can accept/decline

## Setup Required

Run via Paperclip API or dashboard:
```bash
# Create agents using the Paperclip CLI
# Requires: PAPERCLIP_API_KEY and PAPERCLIP_COMPANY_ID
```