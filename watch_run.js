const https = require('https');

const owner = 'maurice64bit';
const repo = 'online-voting-system';
const runId = process.argv[2];
if (!runId) {
  console.error('Usage: node watch_run.js <runId>');
  process.exit(1);
}

const opts = { headers: { 'User-Agent': 'node' } };

function check() {
  https.get(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`, opts, (res) => {
    let d = '';
    res.on('data', (c) => d += c);
    res.on('end', () => {
      try {
        const j = JSON.parse(d);
        const r = j.workflow_run || j;
        if (!r || !r.id) {
          console.log('No run info.');
          process.exit(1);
        }
        console.log(new Date().toISOString(), `${r.id} | ${r.name} | ${r.event} | ${r.status} | ${r.conclusion}`);
        if (r.status === 'completed') {
          console.log('Run finished:', r.conclusion, r.html_url);
          process.exit(0);
        }
      } catch (e) {
        console.error('Parse error:', e.message);
        process.exit(1);
      }
    });
  }).on('error', (e) => { console.error('Request error:', e.message); process.exit(1); });
}

let elapsed = 0;
const interval = 5000;
const timeout = 5 * 60 * 1000; // 5 minutes
check();
const t = setInterval(() => {
  elapsed += interval;
  if (elapsed > timeout) {
    console.error('Timeout waiting for run to complete.');
    process.exit(2);
  }
  check();
}, interval);
