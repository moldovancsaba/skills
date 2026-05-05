# CHECKLIST Agent Configurations

This directory contains the agent configurations for the Strategic Intelligence OS.

## Agents to Create

### 1. Intelligence Orchestrator
Reports to: System Operator (CEO)

```json
{
  "name": "Intelligence Orchestrator",
  "role": "intelligence_orchestrator", 
  "title": "Chief Strategy Officer",
  "icon": "brain",
  "adapterType": "codex_local",
  "adapterConfig": {
    "model": "o4-mini",
    "cwd": "./checklist-local"
  },
  "capabilities": "Owns strategic synthesis, coordinates entity specialists, generates high-yield NBAs"
}
```

### 2. Product & Value Specialist
Reports to: Intelligence Orchestrator

```json
{
  "name": "Product Specialist",
  "role": "product_specialist",
  "title": "Strategic Product Analyst",
  "icon": "package",
  "adapterType": "codex_local",
  "adapterConfig": {
    "model": "o4-mini"
  },
  "capabilities": "Analyzes products, identifies value gaps, recommends strategic improvements"
}
```

### 3. Market & Customer Specialist
Reports to: Intelligence Orchestrator

```json
{
  "name": "Market Specialist", 
  "role": "market_specialist",
  "title": "Market Insights Analyst",
  "icon": "users",
  "adapterType": "codex_local",
  "adapterConfig": {
    "model": "o4-mini"
  },
  "capabilities": "Analyzes market data, identifies segments, harvests high-confidence insights"
}
```

### 4. Competitive Intelligence Specialist
Reports to: Intelligence Orchestrator

```json
{
  "name": "Competitive Specialist",
  "role": "competitive_specialist", 
  "title": "Strategic Intelligence Agent",
  "icon": "search",
  "adapterType": "codex_local",
  "adapterConfig": {
    "model": "o4-mini"
  },
  "capabilities": "Monitors competitors, analyzes positioning, flags strategic threats"
}
```

## Agent Communication Flow

1. Operator synchronizes data (products, customers, competitors, files).
2. Entity specialists analyze their respective domains.
3. Orchestrator synthesizes findings and generates high-yield checklist items (NBAs).
4. Operator sees intelligence cards and can accept/decline actions.

## Setup Required

Run via system API or CLI:
```bash
# Initialize agents via the command line
# Requires: SYSTEM_INGEST_SECRET and COMPANY_ID
```