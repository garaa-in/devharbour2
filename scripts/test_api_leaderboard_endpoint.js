const handler = require('../api/leaderboard');

const req = {
  method: 'GET',
  query: { timeframe: 'All-time', limit: '10' }
};

const res = {
  statusCode: 200,
  headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(code) { this.statusCode = code; return this; },
  json(data) {
    console.log('Leaderboard API response status:', this.statusCode);
    console.log('Rankings count:', data.rankings.length);
    console.log('Top 3 rankings:');
    console.log(data.rankings.slice(0, 3));
    process.exit(0);
  }
};

handler(req, res);
