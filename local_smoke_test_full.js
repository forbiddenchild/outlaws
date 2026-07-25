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
  const host = '127.0.0.1';
  const port = 3000;
  // fetch positions
  const posRes = await request({ hostname: host, port, path: '/api/positions', method: 'GET' });
  if (posRes.statusCode !== 200) {
    console.error('/api/positions failed', posRes.statusCode, posRes.body);
    process.exit(2);
  }
  const positions = JSON.parse(posRes.body);
  console.log('positions:', positions.map(p => p.key).join(', '));

  // create a contestant for each position
  for (const p of positions) {
    const body = JSON.stringify({ username: 'admin', password: 'prisonbreak11', name: `Test ${p.key}`, position: p.key });
    const res = await request({ hostname: host, port, path: '/api/admin/contestants', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, body);
    console.log(`/api/admin/contestants ${p.key} ->`, res.statusCode, res.body);
    if (res.statusCode !== 201 && res.statusCode !== 500 && res.statusCode !== 409) {
      console.error('unexpected status creating contestant', res.statusCode, res.body);
      process.exit(3);
    }
  }

  // get contestants to verify
  const cRes = await request({ hostname: host, port, path: '/api/contestants', method: 'GET' });
  console.log('/api/contestants ->', cRes.statusCode);
  const grouped = JSON.parse(cRes.body);

  // ensure election window is open (set to wide window)
  const settingsBody = JSON.stringify({ username: 'admin', password: 'prisonbreak11', startTime: '2026-07-01T00:00:00', endTime: '2027-01-01T00:00:00' });
  const settingsRes = await request({ hostname: host, port, path: '/api/admin/settings', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(settingsBody) } }, settingsBody);
  console.log('/api/admin/settings ->', settingsRes.statusCode, settingsRes.body);

  // prepare selections mapping each position to the candidate we just created
  const selections = {};
  for (const p of positions) {
    selections[p.key] = `Test ${p.key}`;
  }

  // try several seeded voters until one succeeds
  const voters = [
    { fullName: 'Abaho Emmanuel', password: 'NbrnT' },
    { fullName: 'Abaine Johan', password: 'P3fAb' },
    { fullName: 'Abor Innocent', password: 'nFbmO' },
    { fullName: 'Adaka Harry Jonathan K', password: 'HnKYa' },
    { fullName: 'Adema Mark', password: 'XRvj7' }
  ];

  for (const v of voters) {
    const voteBody = JSON.stringify({ fullName: v.fullName, password: v.password, selections });
    const voteRes = await request({ hostname: host, port, path: '/api/vote', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(voteBody) } }, voteBody);
    console.log('/api/vote', v.fullName, '->', voteRes.statusCode, voteRes.body);
    if (voteRes.statusCode === 201) {
      break;
    }
  }

  process.exit(0);
}

run().catch(e => { console.error('test failed', e && e.message ? e.message : e); process.exit(1); });
