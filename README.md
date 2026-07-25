# Washington Outlaws Voting App

This repository contains a Node/Express voting app that can run with SQLite locally or Postgres in production. Uploads can be stored locally or in Cloudinary for persistence on ephemeral hosts.

**Required environment variables (Render / production)**
- `DATABASE_URL`: Postgres connection string (recommended: Render managed Postgres).
- `ADMIN_USERNAME`: admin username (default: `admin`).
- `ADMIN_PASSWORD`: admin password (default: `prisonbreak11`).
- `CLOUDINARY_URL`: (optional) Cloudinary URL for image uploads. If set, uploads are stored remotely and survive instance restarts.
- `DATA_DIR`: (optional) local data directory. NOT recommended for production since ephemeral filesystems lose data.

**Deploy to Render (recommended free managed Postgres + web service)**
1. Connect your repo to Render and create a Web Service.
2. Use the included `render.yaml` (already configured for a `docker` service). Ensure `DATABASE_URL` and `CLOUDINARY_URL` are added as environment secrets in Render and are marked `sync: false`.
3. Build & Start: Render will use the included `Dockerfile` which runs `node server.js`.
4. After deploy, verify these endpoints:
   - `GET /` — serves frontend
   - `POST /api/admin/login` — admin login
   - `POST /api/admin/contestants` — add contestant (multipart/form-data for image uploads)
   - `POST /api/vote` — submit vote

**Ensure persistence across free-tier restarts**
- Use a managed Postgres (`DATABASE_URL`) for all structured data.
- Use `CLOUDINARY_URL` for image uploads so uploaded files are not lost when the instance sleeps.
- Do not rely on the local `uploads/` directory in production.

**Local testing**
- Install deps: `npm ci`
- Start server:

```powershell
# Windows PowerShell
$env:DATABASE_URL='postgresql://...'
$env:ADMIN_USERNAME='admin'
$env:ADMIN_PASSWORD='prisonbreak11'
$env:CLOUDINARY_URL='cloudinary://...'
node server.js
```

- Run the included smoke tests:

```bash
node local_smoke_test.js         # quick root + admin login
node local_smoke_test_full.js    # creates contestants and submits a ballot
```

**Data migration (SQLite -> Postgres)**
- If you have existing `outlaws.db`, export and import via a migration script or use `pg` to read from SQLite and insert into Postgres using the app's DB helpers.

**Backups & monitoring**
- Enable Postgres backups on your managed provider.
- Periodically export `pg_dump` snapshots to external storage.

If you'd like, I can:
- Add a one-off migration script to copy SQLite data into Postgres.
- Add a CI action to deploy to Render on push.
- Automate scheduled `pg_dump` backups to a cloud bucket.

I implemented all three of the above in this repo:

- Migration script: `migrate_sqlite_to_postgres.js` — run locally with:

```bash
DATABASE_URL="postgresql://user:pw@host/dbname" node migrate_sqlite_to_postgres.js
```

- Deploy action: `.github/workflows/deploy-to-render.yml` — triggers on push to `main`. You must set the repository secrets `RENDER_API_KEY` and `RENDER_SERVICE_ID`.

- Backup action: `.github/workflows/backup-postgres.yml` — scheduled daily at 02:00 UTC and manually triggerable. Configure one of the following:
   - Preferred: set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `S3_BUCKET` in repo secrets to upload backups to S3.
   - Fallback: the workflow will upload the dump as a GitHub Actions artifact if S3 credentials are not provided.

Make sure to add the required secrets in your repository settings before enabling the workflows.
