const https = require('https');

const owner = 'maurice64bit';
const repo = 'online-voting-system';

const opts = { headers: { 'User-Agent': 'node' } };

https.get(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=5`, opts, (res) => {
  let d = '';
  res.on('data', (c) => d += c);
  res.on('end', () => {
    try {
      const j = JSON.parse(d);
      if (!j.workflow_runs) {
        console.log('No workflow runs found or repository is private.');
        return;
      }
      j.workflow_runs.forEach((r) => {
        console.log(`${r.id} | ${r.name} | ${r.event} | ${r.status} | ${r.conclusion} | ${r.html_url} | ${r.created_at}`);
      });
    } catch (e) {
      console.error('Failed to parse GitHub response:', e.message);
      console.error(d.slice(0, 1000));
    }
  });
}).on('error', (e) => {
  console.error('Request error:', e.message);
});
