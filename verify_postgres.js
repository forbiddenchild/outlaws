const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL || 'postgresql://outlaws_user:hxzkiY8Af5UWMlV4ykFjXEaD19Hk1GdL@dpg-d9i9i0urnols73et5gj0-a.oregon-postgres.render.com/outlaws';

async function main() {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log('Connected to Postgres.');

    const tables = ['voters','contestants','ballots','vote_selections','positions','election_settings'];
    for (const t of tables) {
      try {
        const r = await client.query(`SELECT COUNT(*) AS count FROM ${t}`);
        console.log(`${t}: ${r.rows[0].count}`);
      } catch (e) {
        console.log(`${t}: error (${e.message})`);
      }
    }

    // sample rows
    const sampleVoters = await client.query('SELECT full_name, password, has_voted FROM voters LIMIT 5');
    console.log('\nSample voters:');
    console.table(sampleVoters.rows);

    const sampleContestants = await client.query('SELECT name, position, photo_path FROM contestants LIMIT 5');
    console.log('\nSample contestants:');
    console.table(sampleContestants.rows);

    await client.end();
  } catch (err) {
    console.error('Verification failed:', err.message || err);
    process.exit(1);
  }
}

main();
