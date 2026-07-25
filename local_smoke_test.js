const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  // wait for server
  for (let i = 0; i < 12; i++) {
    try {
      const r = await request({ hostname: 'localhost', port: 3001, path: '/', method: 'GET' });
      console.log('GET / ->', r.statusCode);
      break;
    } catch (e) {
      if (i === 11) {
        console.error('server did not start in time');
        process.exit(2);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // admin login
  const loginBody = JSON.stringify({ username: 'admin', password: 'admin' });
  const login = await request(
    { hostname: 'localhost', port: 3001, path: '/api/admin/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) } },
    loginBody
  );
  console.log('/api/admin/login ->', login.statusCode, login.body);

  process.exit(0);
}

run().catch((e) => { console.error('smoke test failed', e && e.message ? e.message : e); process.exit(1); });
