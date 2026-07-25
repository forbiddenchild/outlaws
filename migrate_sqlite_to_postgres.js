const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, 'outlaws.db');
  const databaseUrl = process.env.DATABASE_URL;

  if (!fs.existsSync(sqlitePath)) {
    console.error('SQLite DB not found at', sqlitePath);
    process.exit(1);
  }

  if (!databaseUrl) {
    console.error('Please set DATABASE_URL to target Postgres connection string.');
    process.exit(1);
  }

  const sqlite = new sqlite3.Database(sqlitePath);
  const pg = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const all = (sql, params=[]) => new Promise((res, rej) => sqlite.all(sql, params, (e, rows) => e ? rej(e) : res(rows)));
  const get = (sql, params=[]) => new Promise((res, rej) => sqlite.get(sql, params, (e, row) => e ? rej(e) : res(row)));

  try {
    await pg.query('BEGIN');

    // Positions
    const positions = await all('SELECT key, label, order_idx FROM positions');
    for (const p of positions) {
      await pg.query('INSERT INTO positions (key, label, order_idx) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING', [p.key, p.label, p.order_idx]);
    }

    // Election settings
    const settings = await all('SELECT key, value FROM election_settings');
    for (const s of settings) {
      await pg.query('INSERT INTO election_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [s.key, s.value]);
    }

    // Voters
    const voters = await all('SELECT id, password, full_name, has_voted FROM voters');
    for (const v of voters) {
      await pg.query('INSERT INTO voters (password, full_name, has_voted) VALUES ($1, $2, $3) ON CONFLICT (password) DO NOTHING', [v.password, v.full_name, v.has_voted]);
    }

    // Contestants
    const contestants = await all('SELECT id, name, position, photo_path, created_at FROM contestants');
    for (const c of contestants) {
      await pg.query('INSERT INTO contestants (name, position, photo_path, created_at) VALUES ($1, $2, $3, $4)', [c.name, c.position, c.photo_path, c.created_at]);
    }

    // Ballots and vote_selections (preserve relationships)
    const ballots = await all('SELECT id, voter_password, voter_name, created_at FROM ballots');
    const idMap = {}; // sqlite id -> pg id
    for (const b of ballots) {
      const res = await pg.query('INSERT INTO ballots (voter_password, voter_name, created_at) VALUES ($1, $2, $3) RETURNING id', [b.voter_password, b.voter_name, b.created_at]);
      idMap[b.id] = res.rows[0].id;
    }

    const selections = await all('SELECT ballot_id, position_key, candidate FROM vote_selections');
    for (const s of selections) {
      const newBallotId = idMap[s.ballot_id];
      if (newBallotId) {
        await pg.query('INSERT INTO vote_selections (ballot_id, position_key, candidate) VALUES ($1, $2, $3)', [newBallotId, s.position_key, s.candidate]);
      }
    }

    await pg.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message || err);
    await pg.query('ROLLBACK').catch(() => {});
    process.exit(1);
  } finally {
    sqlite.close();
    await pg.end();
  }
}

main();
