const { Client } = require('pg');
const crypto = require('crypto');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Set DATABASE_URL to your Postgres connection string.');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Postgres for dedupe.');

  // Find duplicate passwords
  const dupRes = await client.query(`
    SELECT password, array_agg(id ORDER BY id) AS ids, count(*)
    FROM voters
    GROUP BY password
    HAVING count(*) > 1
  `);

  console.log('Duplicate password groups:', dupRes.rowCount);
  let updated = 0;

  for (const row of dupRes.rows) {
    const pw = row.password;
    const ids = row.ids; // first will be kept
    for (let i = 1; i < ids.length; i++) {
      const id = ids[i];
      const suffix = crypto.randomBytes(4).toString('hex');
      const newPw = `${pw}__${id}__${suffix}`;
      await client.query('UPDATE voters SET password = $1 WHERE id = $2', [newPw, id]);
      updated++;
    }
  }

  console.log('Updated duplicate password rows:', updated);

  // Try to add unique constraint back
  try {
    await client.query('ALTER TABLE voters ADD CONSTRAINT voters_password_key UNIQUE (password)');
    console.log('Added unique constraint on voters.password');
  } catch (e) {
    console.error('Could not add unique constraint:', e.message || e);
  }

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
