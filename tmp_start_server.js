const path = require('path');

process.env.DATABASE_URL = 'postgresql://outlaws_user:hxzkiY8Af5UWMlV4ykFjXEaD19Hk1GdL@dpg-d9i9i0urnols73et5gj0-a.oregon-postgres.render.com/outlaws';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'admin';
process.env.PORT = '3004';

require(path.join(__dirname, 'server.js'));
