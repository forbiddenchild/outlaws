const { Client } = require('pg');

async function main() {
  process.env.DATABASE_URL = 'postgresql://outlaws_user:hxzkiY8Af5UWMlV4ykFjXEaD19Hk1GdL@dpg-d9i9i0urnols73et5gj0-a.oregon-postgres.render.com/outlaws';
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const res = await client.query('SELECT NOW() AS now');
    console.log('connected', res.rows[0]);
  } catch (err) {
    console.error('db error', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
