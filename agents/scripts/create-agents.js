#!/usr/bin/env node

const API_URL = process.env.PAPERCLIP_API_URL || 'https://api.paperclip.ai';
const API_KEY = process.env.PAPERCLIP_API_KEY;
const COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID;

const agents = [
  {
    name: 'Marketing Orchestrator',
    role: 'marketing_orchestrator',
    title: 'Chief Marketing Officer',
    icon: 'brain',
    reportsTo: null,
    capabilities: 'Owns marketing strategy, coordinates specialists, generates NBAs',
    adapterType: 'codex_local',
    adapterConfig: { model: 'o4-mini' },
    runtimeConfig: { heartbeat: { enabled: true, intervalSec: 300 } }
  },
  {
    name: 'Product Specialist',
    role: 'product_specialist',
    title: 'Product Marketing Specialist',
    icon: 'package',
    capabilities: 'Analyzes products, identifies gaps, recommends improvements',
    adapterType: 'codex_local',
    adapterConfig: { model: 'o4-mini' }
  },
  {
    name: 'Customer Specialist',
    role: 'customer_specialist',
    title: 'Customer Insights Analyst',
    icon: 'users',
    capabilities: 'Analyzes customer data, identifies segments, finds insights',
    adapterType: 'codex_local',
    adapterConfig: { model: 'o4-mini' }
  },
  {
    name: 'Competitor Specialist',
    role: 'competitor_specialist',
    title: 'Competitive Intelligence Agent',
    icon: 'search',
    capabilities: 'Monitors competitors, analyzes positioning, flags threats',
    adapterType: 'codex_local',
    adapterConfig: { model: 'o4-mini' }
  }
];

async function createAgent(agent) {
  const response = await fetch(`${API_URL}/api/companies/${COMPANY_ID}/agent-hires`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(agent)
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to create ${agent.name}:`, error);
    return null;
  }
  
  return response.json();
}

async function main() {
  if (!API_KEY || !COMPANY_ID) {
    console.error('Error: PAPERCLIP_API_KEY and PAPERCLIP_COMPANY_ID required');
    console.log('\nSet environment variables:');
    console.log('export PAPERCLIP_API_KEY=your-api-key');
    console.log('export PAPERCLIP_COMPANY_ID=your-company-id');
    process.exit(1);
  }
  
  console.log('Creating Paperclip agents...\n');
  
  for (const agent of agents) {
    console.log(`Creating ${agent.name}...`);
    const result = await createAgent(agent);
    if (result) {
      console.log(`✓ ${agent.name} created: ${result.id || 'success'}\n`);
    }
  }
  
  console.log('Done!');
}

main();