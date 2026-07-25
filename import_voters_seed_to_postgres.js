const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('Set DATABASE_URL environment variable to your Postgres connection string.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const seedPath = path.join(__dirname, 'voters_seed.json');

  let seed;
  try {
    seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  } catch (e) {
    console.error('Failed to read or parse voters_seed.json:', e.message);
    process.exit(1);
  }

  console.log('Seed voters:', seed.length);

  let inserted = 0;
  let skipped = 0;

  const client = await pool.connect();
  try {
    // If the voters.password column has a UNIQUE constraint in Postgres,
    // drop it so multiple voters can share the same generated ID value.
    try {
      await client.query('ALTER TABLE voters DROP CONSTRAINT IF EXISTS voters_password_key');
      console.log('Dropped voters password unique constraint (if it existed).');
    } catch (e) {
      console.warn('Could not drop password unique constraint (continuing):', e.message || e);
    }
    for (const v of seed) {
      const fullName = (v.fullName || v.full_name || '').trim();
      const password = (v.password || v.pass || '') + '';
      if (!fullName) continue;

      const res = await client.query('SELECT id FROM voters WHERE full_name = $1 LIMIT 1', [fullName]);
      if (res.rowCount > 0) {
        skipped++;
        continue;
      }

      await client.query('INSERT INTO voters (full_name, password, has_voted) VALUES ($1, $2, 0)', [fullName, password]);
      inserted++;
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`Inserted: ${inserted}, Skipped (already present): ${skipped}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
