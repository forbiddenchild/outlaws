const https = require('https');
const runId = process.argv[2];
if (!runId) { console.error('usage: node fetch_run_jobs.js <runId>'); process.exit(1); }
const owner = 'maurice64bit';
const repo = 'online-voting-system';
https.get(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, { headers: { 'User-Agent': 'node' } }, (res) => {
  let d = '';
  res.on('data', (c) => d += c);
  res.on('end', () => {
    try {
      const j = JSON.parse(d);
      if (!j.jobs) { console.log('no jobs found'); return; }
      j.jobs.forEach(job => console.log(`${job.id} | ${job.name} | ${job.status} | ${job.conclusion} | ${job.html_url}`));
    } catch (e) { console.error('parse error', e.message); console.error(d.slice(0,1000)); }
  });
}).on('error', (e) => console.error('request error', e.message));
