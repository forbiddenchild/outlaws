const { Client } = require('pg');
const databaseUrl = 'postgresql://outlaws_user:hxzkiY8Af5UWMlV4ykFjXEaD19Hk1GdL@dpg-d9i9i0urnols73et5gj0-a.oregon-postgres.render.com/outlaws';
const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

client.connect().then(function() {
  console.log('connected');
  return client.end();
}).catch(function(e) {
  console.error('connect-error', e.message);
  process.exit(1);
});
