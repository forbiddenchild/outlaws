const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const res1 = await client.query("SELECT conname, contype, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'voters'::regclass;");
    console.log('constraints:');
    console.log(JSON.stringify(res1.rows, null, 2));
    const res2 = await client.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'voters';");
    console.log('indexes:');
    console.log(JSON.stringify(res2.rows, null, 2));
  } catch (err) {
    console.error('ERROR', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
