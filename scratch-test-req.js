const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/nba?companyId=9c5d9ab5-182c-4d6a-9559-1749fb6c7698',
  method: 'GET',
};

// I cannot test Next.js /api easily because verifyMembership checks cookies/headers.
// But I can override verifyMembership locally just to test.
