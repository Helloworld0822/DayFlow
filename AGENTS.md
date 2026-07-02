# AGENTS.md

## Cursor Cloud specific instructions

DayFlow is an AI schedule/calendar manager: a **FastAPI** backend (`backend/`, Python) plus a **React + Vite** frontend (`frontend/`). Standard commands live in `frontend/package.json` and `backend/requirements.txt`; see the repo README/`claude.md` for product context.

The Cloud Agent VM already has Python 3.12, Node 22, and PostgreSQL 16 installed. The update script refreshes dependencies (`.venv` + `frontend` node_modules). It does **not** start services.

### Running the app (dev)
- PostgreSQL is used (not the SQLite fallback). Start it once per session: `sudo service postgresql start`. A `postgres/postgres` superuser and an `appuser`/`apppassword`-owned `appdb` database already exist in the VM snapshot.
- Backend env lives in `backend/.env` (gitignored, already present in the snapshot). It sets `DATABASE_URL=postgresql://appuser:apppassword@localhost:5432/appdb`. If missing, copy `backend/.env.example` and change the DB host from `db` to `localhost`.
- Backend must be run from the repo root (imports are `backend.*`): `source .venv/bin/activate && uvicorn backend.main:app --host 0.0.0.0 --port 8000`. Tables auto-create on startup; no migrations.
- Frontend: `cd frontend && npm run dev` (Vite on :5173, proxies `/auth`, `/schedules`, `/ai`, etc. to `localhost:8000`). Use the app at http://localhost:5173.
- Lint: `cd frontend && npm run lint`. There are no automated tests and no backend linter.

### Non-obvious caveats
- This VM has a `/.dockerenv` file, so `core/database.py`'s Docker detection would otherwise force the `db` host; that is why `DATABASE_URL` must point at `localhost` and a real local Postgres is used.
- The email validator rejects reserved TLDs like `.test`; use `@example.com` for demo accounts.
- AI/Google/Microsoft features need real API keys/OAuth secrets (unset by default); core auth + schedule CRUD work without them.
