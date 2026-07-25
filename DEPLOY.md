# Deploying to Render

This app is a stateful Node/Express + SQLite service, deployed to Render as a
Docker web service using the `Dockerfile` and `render.yaml` already in this
repo.

## How it works

- Render builds and runs the app directly from `Dockerfile` — no extra
  reverse proxy needed, Render terminates HTTPS for you on a free
  `*.onrender.com` subdomain.
- The database path is controlled by `DATA_DIR` (defaults to the app
  directory if unset — see `server.js`). `render.yaml` sets `DATA_DIR=/app/data`.
- **The real voter database is never committed to git.** Instead, it's
  uploaded once to Render as a **Secret File** named `outlaws.db`. On boot,
  if `DATA_DIR` has no database yet, `server.js` copies it in from
  `/etc/secrets/outlaws.db` (where Render mounts secret files). Every boot
  after that is a no-op, since a database already exists at `DATA_DIR`.
- `voters_seed.json` is excluded from the Docker build (`.dockerignore`) —
  it has heavy password duplication that crashes the app on a genuinely
  empty database, so it must never be what seeds a fresh deploy. The Secret
  File is the only seeding path used on Render.

## Current setup: no persistent disk (test deployment)

`render.yaml` currently has **no disk**, to avoid the cost while this is
just being tested. That means:

- Every restart or redeploy wipes all state and boots fresh from the
  `outlaws.db` Secret File — you always get the real ~327-voter roster
  back, but any votes cast, voters added, or contestants uploaded *during*
  a session are gone on the next restart/redeploy.
- This is **not safe for a real election**. Before going live, add a
  persistent disk back (see below).

## One-time setup steps

1. **Push this repo to GitHub** (already done) — Render builds from git.
2. In the Render dashboard: **New +** → **Blueprint** → connect this
   GitHub repo. Render reads `render.yaml` and creates the service.
3. Fill in the two secret env vars it prompts for:
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD` — use a real password here, not the source default.
4. **Environment → Secret Files** → add a file named exactly `outlaws.db`,
   contents = your local `outlaws.db`. Never commit this file to git.
5. Deploy. Check the logs for `Database ready at /app/data/outlaws.db` with
   no crash — confirms the seed copy worked.
6. Re-add any contestant photos through the admin **Upload Contestant
   Details** form (uploads aren't seeded from a Secret File, only the DB is
   — see "What's not covered" below).

## Verifying a deploy

- Visit `https://<your-service>.onrender.com` — the voter login dropdown
  should show the real roster (~327 names), not an empty list.
- Log in as admin and confirm the election schedule / contestants look
  right.

## Going live: add the persistent disk back

When this stops being a test and needs to hold real votes across
restarts/redeploys, add back to `render.yaml`:

```yaml
    disk:
      name: voting-data
      mountPath: /app/data
      sizeGB: 1
```

This requires a paid plan (already set via `plan: starter`). After adding
it and redeploying once, the disk starts empty and seeds itself from the
`outlaws.db` Secret File exactly as described above — from then on, all
data (votes, new voters, contestants, admin schedule changes) persists
across restarts and redeploys.

## What's not covered by the Secret File seed

Only `outlaws.db` is seeded this way. Uploaded contestant photos
(`uploads/`) are not — they're low-stakes to recreate (just re-upload
through the admin UI) and weren't worth the extra tar/extract machinery a
whole-directory Secret File would need. If you'd rather preserve exact
original files, use Render's SSH shell (available on paid plans, from the
service's **Connect** tab) to `scp` files into `/app/data/uploads/`
directly, then restart the service so it's not left mid-write.

## Environment variables reference

| Variable | Set by | Purpose |
|---|---|---|
| `PORT` | Render (automatic) | Port the app listens on |
| `DATA_DIR` | `render.yaml` | Where `outlaws.db` and `uploads/` live |
| `DB_SEED_PATH` | defaults to `/etc/secrets/outlaws.db` | Where the first-boot DB seed is read from |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | set manually in the Render dashboard | Admin portal login |
