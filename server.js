const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = process.env.DATA_DIR || __dirname;
const dbPath = path.join(dataDir, 'outlaws.db');
const seedPath = path.join(__dirname, 'voters_seed.json');
const uploadDir = path.join(dataDir, 'uploads');
const adminSeed = fs.existsSync(seedPath) ? JSON.parse(fs.readFileSync(seedPath, 'utf8')) : [];
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'prisonbreak11';
const databaseUrl = process.env.DATABASE_URL || '';
const usePostgres = Boolean(databaseUrl);
let db = null;
let pgClient = null;

const dbSeedPath = process.env.DB_SEED_PATH || '/etc/secrets/outlaws.db';
if (!usePostgres && !fs.existsSync(dbPath) && fs.existsSync(dbSeedPath)) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(dbSeedPath, dbPath);
}

function prepareQuery(sql, params = []) {
  if (!usePostgres || !params.length) {
    return { sql, params };
  }

  let index = 0;
  return {
    sql: sql.replace(/\?/g, () => `$${++index}`),
    params
  };
}

function dbAll(sql, params = [], callback) {
  if (usePostgres) {
    const { sql: preparedSql, params: preparedParams } = prepareQuery(sql, params);
    pgClient.query(preparedSql, preparedParams)
      .then((result) => callback(null, result.rows))
      .catch(callback);
  } else {
    db.all(sql, params, callback);
  }
}

function dbGet(sql, params = [], callback) {
  if (usePostgres) {
    const { sql: preparedSql, params: preparedParams } = prepareQuery(sql, params);
    pgClient.query(preparedSql, preparedParams)
      .then((result) => callback(null, result.rows[0] || null))
      .catch(callback);
  } else {
    db.get(sql, params, callback);
  }
}

function dbRun(sql, params = [], callback) {
  if (usePostgres) {
    const { sql: preparedSql, params: preparedParams } = prepareQuery(sql, params);
    pgClient.query(preparedSql, preparedParams)
      .then(() => callback(null))
      .catch(callback);
  } else {
    db.run(sql, params, callback);
  }
}

function dbRunReturning(sql, params = [], callback) {
  if (usePostgres) {
    const { sql: preparedSql, params: preparedParams } = prepareQuery(sql, params);
    pgClient.query(preparedSql, preparedParams)
      .then((result) => callback(null, result.rows[0] || null))
      .catch(callback);
  } else {
    db.run(sql, params, function (err) {
      callback(err, this);
    });
  }
}

function dbAllPromise(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbAll(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function dbGetPromise(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbGet(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function dbRunPromise(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbRun(sql, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

fs.mkdirSync(uploadDir, { recursive: true });

if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ url: process.env.CLOUDINARY_URL });
}
const useCloudinary = Boolean(process.env.CLOUDINARY_URL);

const upload = multer({
  storage: useCloudinary ? multer.memoryStorage() : multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => {
      const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      callback(null, safeName);
    }
  })
});

function uploadToCloudinary(buffer, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ resource_type: 'image', public_id: `outlaws/${Date.now()}-${filename}` }, (error, result) => {
      if (error) return reject(error);
      resolve(result && result.secure_url ? result.secure_url : null);
    });
    stream.end(buffer);
  });
}

const defaultPositions = [
  { key: 'president', label: 'President' },
  { key: 'vice_president', label: 'Vice President' },
  { key: 'treasurer', label: 'Treasurer' },
  { key: 'secretary', label: 'Secretary' },
  { key: 'mobiliser', label: 'Mobiliser' },
  { key: 'publicity_secretary', label: 'Publicity Secretary' }
];

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function getPositions(callback) {
  db.all('SELECT key, label FROM positions ORDER BY order_idx ASC', [], (err, rows) => {
    if (err) {
      callback(err);
      return;
    }
    callback(null, rows || []);
  });
}

function getPositionKey(label, callback) {
  const baseKey = slugify(label);
  if (!baseKey) {
    callback(new Error('Invalid position label.'));
    return;
  }

  db.get('SELECT key FROM positions WHERE key = ?', [baseKey], (err, row) => {
    if (err) {
      callback(err);
      return;
    }

    if (!row) {
      callback(null, baseKey);
      return;
    }

    let suffix = 1;
    const tryKey = () => {
      const candidate = `${baseKey}_${suffix}`;
      db.get('SELECT key FROM positions WHERE key = ?', [candidate], (lookupErr, lookupRow) => {
        if (lookupErr) {
          callback(lookupErr);
          return;
        }
        if (!lookupRow) {
          callback(null, candidate);
          return;
        }

        suffix += 1;
        tryKey();
      });
    };

    tryKey();
  });
}

function buildVoterOptionsHtml() {
  return adminSeed
    .map((voter) => `          <option value="${String(voter.fullName).replace(/"/g, '&quot;')}">${String(voter.fullName).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</option>`)
    .join('\n');
}

function getElectionSetting(key, callback) {
  db.get('SELECT value FROM election_settings WHERE key = ?', [key], (err, row) => {
    if (err) {
      callback(null, null);
      return;
    }

    callback(null, row ? row.value : null);
  });
}

function isVotingWindowOpen(callback) {
  getElectionSetting('election_start_time', (startErr, startTime) => {
    if (startErr || !startTime) {
      callback(false);
      return;
    }

    getElectionSetting('election_end_time', (endErr, endTime) => {
      if (endErr || !endTime) {
        callback(false);
        return;
      }

      const now = Date.now();
      callback(now >= new Date(startTime).getTime() && now <= new Date(endTime).getTime());
    });
  });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/uploads', express.static(uploadDir));

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8').replace('<!-- VOTER_OPTIONS -->', buildVoterOptionsHtml());
  res.send(indexHtml);
});

app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

async function initializeDatabase() {
  if (usePostgres) {
    pgClient = new Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }
    });

    await pgClient.connect();
    db = {
      all: dbAll,
      get: dbGet,
      run: dbRun
    };
  } else {
    await new Promise((resolve, reject) => {
      db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  try {
    await dbRunPromise(`
      CREATE TABLE IF NOT EXISTS voters (
        ${usePostgres ? 'id SERIAL PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT'},
        password TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        has_voted INTEGER DEFAULT 0
      )
    `);

    await dbRunPromise(`
      CREATE TABLE IF NOT EXISTS contestants (
        ${usePostgres ? 'id SERIAL PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT'},
        name TEXT NOT NULL,
        position TEXT NOT NULL,
        photo_path TEXT,
        created_at ${usePostgres ? 'TIMESTAMP' : 'TEXT'} DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbRunPromise(`
      CREATE TABLE IF NOT EXISTS election_settings (
        ${usePostgres ? 'id SERIAL PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT'},
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL
      )
    `);

    await dbRunPromise(`
      CREATE TABLE IF NOT EXISTS positions (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        order_idx INTEGER NOT NULL
      )
    `);

    for (let index = 0; index < defaultPositions.length; index += 1) {
      const position = defaultPositions[index];
      await dbRunPromise(
        `INSERT INTO positions (key, label, order_idx) VALUES (?, ?, ?)` +
        (usePostgres ? ' ON CONFLICT (key) DO NOTHING' : ' ON CONFLICT(key) DO NOTHING'),
        [position.key, position.label, index]
      );
    }

    await dbRunPromise(`
      CREATE TABLE IF NOT EXISTS ballots (
        ${usePostgres ? 'id SERIAL PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT'},
        voter_password TEXT NOT NULL,
        voter_name TEXT NOT NULL,
        created_at ${usePostgres ? 'TIMESTAMP' : 'TEXT'} DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbRunPromise(`
      CREATE TABLE IF NOT EXISTS vote_selections (
        ${usePostgres ? 'id SERIAL PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT'},
        ballot_id INTEGER NOT NULL,
        position_key TEXT NOT NULL,
        candidate TEXT NOT NULL,
        FOREIGN KEY(ballot_id) REFERENCES ballots(id)
      )
    `);

    const countRow = await dbGetPromise('SELECT COUNT(*) AS count FROM voters', []);
    if (countRow && Number(countRow.count) === 0 && adminSeed.length) {
      for (const voter of adminSeed) {
        await dbRunPromise(
          `INSERT INTO voters (password, full_name, has_voted) VALUES (?, ?, 0)` +
          (usePostgres ? ' ON CONFLICT (password) DO NOTHING' : ' ON CONFLICT(password) DO NOTHING'),
          [voter.password, String(voter.fullName).replace(/^[\s\u2022\uF0B7\-]+/, '').trim()]
        );
      }
      console.log(`Seeded ${adminSeed.length} voters from ${seedPath}`);
    }

    await dbRunPromise(
      `INSERT INTO election_settings (key, value) VALUES (?, ?)` +
      (usePostgres ? ' ON CONFLICT (key) DO NOTHING' : ' ON CONFLICT(key) DO NOTHING'),
      ['election_start_time', '2026-07-24T00:00:00']
    );
    await dbRunPromise(
      `INSERT INTO election_settings (key, value) VALUES (?, ?)` +
      (usePostgres ? ' ON CONFLICT (key) DO NOTHING' : ' ON CONFLICT(key) DO NOTHING'),
      ['election_end_time', '2026-12-31T23:59:59']
    );

    console.log('Database ready at', usePostgres ? databaseUrl : dbPath);
  } catch (error) {
    console.error('Failed to initialize database:', error.message || error);
    process.exit(1);
  }
}

app.get('/api/positions', (req, res) => {
  getPositions((err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Could not load positions.' });
    }
    res.json(results);
  });
});

app.get('/api/voters', (req, res) => {
  db.all('SELECT full_name FROM voters ORDER BY full_name ASC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Could not load voter names.' });
    }

    res.json(rows.map((row) => row.full_name));
  });
});

app.post('/api/login', (req, res) => {
  const { fullName, password } = req.body;

  if (!fullName || !password) {
    return res.status(400).json({ error: 'Both your name and unique ID are required.' });
  }

  db.get('SELECT full_name, has_voted FROM voters WHERE full_name = ? AND password = ?', [fullName, password], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Login lookup failed.' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Invalid name or unique ID. Please choose the correct name and enter the matching unique ID.' });
    }

    res.json({
      message: 'Login successful.',
      fullName: row.full_name,
      hasVoted: row.has_voted === 1,
      role: 'voter'
    });
  });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Admin username and password are required.' });
  }

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }

  res.json({
    message: 'Admin login successful.',
    fullName: ADMIN_USERNAME,
    displayName: 'Admin',
    role: 'admin',
    password: ADMIN_PASSWORD
  });
});

app.get('/api/admin/status', (req, res) => {
  getElectionSetting('election_start_time', (startErr, startTime) => {
    if (startErr || !startTime) {
      return res.status(500).json({ error: 'Could not load election schedule.' });
    }

    getElectionSetting('election_end_time', (endErr, endTime) => {
      if (endErr || !endTime) {
        return res.status(500).json({ error: 'Could not load election schedule.' });
      }

      isVotingWindowOpen((isOpen) => {
        res.json({
          startTime,
          endTime,
          isOpen,
          isClosed: !isOpen
        });
      });
    });
  });
});

app.post('/api/admin/settings', (req, res) => {
  const { username, password, startTime, endTime } = req.body;

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  if (!startTime || Number.isNaN(new Date(startTime).getTime())) {
    return res.status(400).json({ error: 'A valid start time is required.' });
  }

  if (!endTime || Number.isNaN(new Date(endTime).getTime())) {
    return res.status(400).json({ error: 'A valid end time is required.' });
  }

  if (new Date(startTime).getTime() >= new Date(endTime).getTime()) {
    return res.status(400).json({ error: 'The start time must be earlier than the closing time.' });
  }

  db.run('UPDATE election_settings SET value = ? WHERE key = ?', [startTime, 'election_start_time'], (startUpdateErr) => {
    if (startUpdateErr) {
      return res.status(500).json({ error: 'Could not update election start time.' });
    }

    db.run('UPDATE election_settings SET value = ? WHERE key = ?', [endTime, 'election_end_time'], (endUpdateErr) => {
      if (endUpdateErr) {
        return res.status(500).json({ error: 'Could not update election closing time.' });
      }

      res.json({ message: 'Election schedule updated.', startTime, endTime });
    });
  });
});

app.post('/api/admin/close', (req, res) => {
  const { username, password } = req.body;

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  const now = new Date().toISOString();
  db.run('UPDATE election_settings SET value = ? WHERE key = ?', [now, 'election_end_time'], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not close voting at this time.' });
    }

    res.json({ message: 'Voting has been ended early.', endTime: now });
  });
});

app.get('/api/admin/contestants', (req, res) => {
  const { username, password } = req.query;

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  db.all('SELECT id, name, position, photo_path FROM contestants ORDER BY position ASC, name ASC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Could not load contestants.' });
    }

    res.json(rows.map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      photoPath: row.photo_path || ''
    })));
  });
});

app.delete('/api/admin/contestants/:id', (req, res) => {
  const { username, password } = req.query;
  const contestantId = Number(req.params.id);

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  if (!contestantId || Number.isNaN(contestantId)) {
    return res.status(400).json({ error: 'A valid contestant ID is required.' });
  }

  db.get('SELECT photo_path FROM contestants WHERE id = ?', [contestantId], (selectErr, row) => {
    if (selectErr) {
      return res.status(500).json({ error: 'Could not look up contestant.' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Contestant not found.' });
    }

    const photoPath = row.photo_path;
    db.run('DELETE FROM contestants WHERE id = ?', [contestantId], function (deleteErr) {
      if (deleteErr) {
        return res.status(500).json({ error: 'Could not delete contestant.' });
      }

      if (photoPath) {
        const filePath = path.join(__dirname, photoPath.replace(/^\//, ''));
        if (filePath.startsWith(uploadDir)) {
          fs.unlink(filePath, () => {});
        }
      }

      res.json({ message: 'Contestant removed successfully.' });
    });
  });
});

app.post('/api/admin/positions', (req, res) => {
  const { username, password, label } = req.body;

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  if (!label || !label.trim()) {
    return res.status(400).json({ error: 'A valid position label is required.' });
  }

  getPositionKey(label.trim(), (keyErr, positionKey) => {
    if (keyErr) {
      return res.status(500).json({ error: 'Could not generate a valid position key.' });
    }

    db.get('SELECT MAX(order_idx) AS maxOrder FROM positions', [], (maxErr, row) => {
      if (maxErr) {
        return res.status(500).json({ error: 'Could not determine position order.' });
      }

      const orderIndex = row && typeof row.maxOrder === 'number' ? row.maxOrder + 1 : 0;
      db.run(
        'INSERT INTO positions (key, label, order_idx) VALUES (?, ?, ?)',
        [positionKey, label.trim(), orderIndex],
        function (insertErr) {
          if (insertErr) {
            return res.status(500).json({ error: 'Could not create new position.' });
          }

          res.status(201).json({ message: 'Position created successfully.', position: { key: positionKey, label: label.trim() } });
        }
      );
    });
  });
});

app.delete('/api/admin/positions/:key', (req, res) => {
  const { username, password } = req.query;
  const positionKey = req.params.key;

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  if (!positionKey || !positionKey.trim()) {
    return res.status(400).json({ error: 'A valid position key is required.' });
  }

  db.get('SELECT key, label FROM positions WHERE key = ?', [positionKey], (selectErr, positionRow) => {
    if (selectErr) {
      return res.status(500).json({ error: 'Could not look up position.' });
    }

    if (!positionRow) {
      return res.status(404).json({ error: 'Position not found.' });
    }

    dbRun('DELETE FROM vote_selections WHERE position_key = ?', [positionKey], (deleteErr1) => {
      if (deleteErr1) {
        return res.status(500).json({ error: 'Could not delete related vote selections.' });
      }

      dbRun('DELETE FROM contestants WHERE position = ?', [positionKey], (deleteErr2) => {
        if (deleteErr2) {
          return res.status(500).json({ error: 'Could not delete related contestants.' });
        }

        dbRun('DELETE FROM positions WHERE key = ?', [positionKey], function (deleteErr3) {
          if (deleteErr3) {
            return res.status(500).json({ error: 'Could not delete position.' });
          }

          res.json({ message: `Position ${positionRow.label} deleted successfully.`, position: positionRow });
        });
      });
    });
  });
});

app.post('/api/admin/contestants', upload.single('photo'), async (req, res) => {
  const { username, password, name, position } = req.body;

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  if (!name || !position) {
    return res.status(400).json({ error: 'Candidate name and position are required.' });
  }

  try {
    let photoPath = '';
    if (req.file) {
      if (useCloudinary && req.file.buffer) {
        try {
          const uploaded = await uploadToCloudinary(req.file.buffer, req.file.originalname || 'upload');
          photoPath = uploaded || '';
        } catch (e) {
          console.error('Cloudinary upload failed:', e.message || e);
          return res.status(500).json({ error: 'Image upload failed.' });
        }
      } else if (req.file.path) {
        photoPath = `/uploads/${path.basename(req.file.path)}`;
      }
    }

    db.run(
      'INSERT INTO contestants (name, position, photo_path) VALUES (?, ?, ?)',
      [name.trim(), position, photoPath],
      function (insertErr) {
        if (insertErr) {
          console.error('Contestant insert failed:', insertErr);
          return res.status(500).json({ error: 'Could not save contestant details.' });
        }

        res.status(201).json({ message: 'Contestant saved successfully.', contestant: { name, position, photoPath } });
      }
    );
  } catch (err) {
    console.error('Unexpected error saving contestant:', err);
    res.status(500).json({ error: 'Could not save contestant details.' });
  }
});


app.post('/api/admin/voters', (req, res) => {
  const { username, password, fullName, uniqueId } = req.body;

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  if (!fullName || !uniqueId) {
    return res.status(400).json({ error: 'Voter full name and unique ID are required.' });
  }

  db.get('SELECT 1 FROM voters WHERE password = ?', [uniqueId], (lookupErr, row) => {
    if (lookupErr) {
      return res.status(500).json({ error: 'Could not verify unique ID.' });
    }

    if (row) {
      return res.status(409).json({ error: 'That unique ID is already registered. Choose a different one.' });
    }

    db.run(
      'INSERT INTO voters (password, full_name, has_voted) VALUES (?, ?, 0)',
      [uniqueId.trim(), fullName.trim()],
      function (insertErr) {
        if (insertErr) {
          return res.status(500).json({ error: 'Could not add voter to the register.' });
        }

        res.status(201).json({ message: 'Voter registered successfully.', voter: { fullName, uniqueId } });
      }
    );
  });
});

app.get('/api/contestants', (req, res) => {
  db.all('SELECT name, position, photo_path FROM contestants ORDER BY position ASC, name ASC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Could not load contestants.' });
    }

    getPositions((posErr, positionsList) => {
      if (posErr) {
        return res.status(500).json({ error: 'Could not load contestants positions.' });
      }

      const grouped = {};
      positionsList.forEach((position) => {
        grouped[position.key] = rows
          .filter((row) => row.position === position.key)
          .map((row) => ({
            name: row.name,
            photoPath: row.photo_path || '/images/SaveClip.App_475291800_18038161979590096_2106789025414944852_n.webp'
          }));
      });

      res.json(grouped);
    });
  });
});

app.post('/api/vote', (req, res) => {
  const { fullName, password, selections } = req.body;

  if (!fullName || !password || !selections) {
    return res.status(400).json({ error: 'All required vote details are missing.' });
  }

  getPositions((posErr, positionsList) => {
    if (posErr) {
      return res.status(500).json({ error: 'Could not validate positions.' });
    }

    const hasAllPositions = positionsList.every((position) => Object.prototype.hasOwnProperty.call(selections, position.key) && selections[position.key]);
    if (!hasAllPositions) {
      return res.status(400).json({ error: 'Please select a candidate for every post.' });
    }

    isVotingWindowOpen((isOpen) => {
      if (!isOpen) {
        return res.status(403).json({ error: 'Voting is not active for this window. Please wait for the scheduled start time or the election may already be closed.' });
      }

      db.get('SELECT full_name, has_voted FROM voters WHERE full_name = ? AND password = ?', [fullName, password], (err, row) => {
        if (err) {
          return res.status(500).json({ error: 'Database lookup failed.' });
        }

        if (!row) {
          return res.status(404).json({ error: 'Voter not found. Use the correct name and unique ID.' });
        }

        if (row.has_voted === 1) {
          return res.status(409).json({ error: 'This voter has already cast a ballot.' });
        }

        const ballotQuery = usePostgres
          ? 'INSERT INTO ballots (voter_password, voter_name) VALUES (?, ?) RETURNING id'
          : 'INSERT INTO ballots (voter_password, voter_name) VALUES (?, ?)';

        dbRunReturning(ballotQuery, [password, row.full_name], (insertErr, result) => {
          if (insertErr) {
            return res.status(500).json({ error: 'Vote submission failed.' });
          }

          const ballotId = usePostgres ? result.id : result.lastID;
          const selectionPromises = positionsList.map((position) => new Promise((resolve, reject) => {
            dbRun(
              'INSERT INTO vote_selections (ballot_id, position_key, candidate) VALUES (?, ?, ?)',
              [ballotId, position.key, selections[position.key]],
              (insertErr2) => {
                if (insertErr2) {
                  reject(insertErr2);
                } else {
                  resolve();
                }
              }
            );
          }));

          Promise.all(selectionPromises)
            .then(() => {
              dbRun(
                'UPDATE voters SET has_voted = 1 WHERE password = ?',
                [password],
                function (updateErr) {
                  if (updateErr) {
                    return res.status(500).json({ error: 'Could not update voter status.' });
                  }

                  res.status(201).json({ message: `Vote recorded successfully for ${row.full_name}.` });
                }
              );
            })
            .catch(() => {
              res.status(500).json({ error: 'Could not save vote selections.' });
            });
        });
      });
    });
  });
});

app.get('/api/admin/results', (req, res) => {
  const { fullName, username, password } = req.query;
  const providedUsername = username || fullName;

  if (providedUsername !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  getPositions((posErr, positionsList) => {
    if (posErr) {
      return res.status(500).json({ error: 'Could not load positions.' });
    }

    const queryPromises = positionsList.map((position) => new Promise((resolve, reject) => {
      db.all(
        `SELECT v.candidate AS candidate, COUNT(*) AS count, c.photo_path
         FROM vote_selections v
         LEFT JOIN contestants c ON c.name = v.candidate AND c.position = ?
         WHERE v.position_key = ?
         GROUP BY v.candidate
         ORDER BY count DESC`,
        [position.key, position.key],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          resolve({
            position: position.key,
            rows: rows.map((row) => ({
              candidate: row.candidate,
              count: row.count,
              photoPath: row.photo_path || '/images/SaveClip.App_475291800_18038161979590096_2106789025414944852_n.webp'
            }))
          });
        }
      );
    }));

    Promise.all(queryPromises)
      .then((results) => {
        const resultMap = {};
        results.forEach(({ position, rows }) => {
          resultMap[position] = rows;
        });

        isVotingWindowOpen((isOpen) => {
          res.json({
            isOpen,
            isClosed: !isOpen,
            results: resultMap
          });
        });
      })
      .catch(() => {
        res.status(500).json({ error: 'Could not load admin results.' });
      });
  });
});

app.get('/api/results', (req, res) => {
  isVotingWindowOpen((isOpen) => {
    res.json({ isOpen, isClosed: !isOpen, results: {} });
  });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Voting app running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err.message || err);
    process.exit(1);
  });
