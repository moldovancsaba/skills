import { GET } from './src/app/api/nba/route';
import { NextRequest } from 'next/server';

async function test() {
  const req = new NextRequest('http://localhost:3000/api/nba?companyId=9c5d9ab5-182c-4d6a-9559-1749fb6c7698');
  
  // mock verifyMembership by hacking the module or just replacing it locally.
}
