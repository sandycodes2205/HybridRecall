# HybridRecall

HybridRecall is a React + Vite and Node.js + Express prototype for managing research-paper submissions, reviewers, reviews, decisions, audit records, and basic abstract-similarity warnings.

## Requirements

Install Node.js 18+ and MySQL 8 (or obtain access to the shared MySQL 8 database from the database owner). VS Code is recommended. No local database is required when the shared database is accessible.

## Setup on Windows

Open two VS Code terminals in the `HybridRecal` folder.

1. Install backend dependencies: `cd backend`, then `npm install`.
2. Create configuration: `Copy-Item .env.example .env`.
3. Edit `backend/.env` and fill exactly these values from the teammate/database owner: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`. `PORT=5000` can remain unchanged.
4. Start the backend with `npm run dev` (or `npm start`).
5. In a second terminal run `cd frontend`, `npm install`, then `npm run dev`.
6. Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

Test `http://localhost:5000/api/health`. It should report `backend: "up"` and a healthy database after valid credentials and schema are available.

## Aiven and Vercel deployment

The backend connects directly to Aiven for MySQL using `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `DB_SSL_CA`. No local MySQL server is needed. Keep these values and the Aiven CA certificate out of Git.

The Vite proxy only works during local development. When deploying the frontend to Vercel, set `VITE_API_BASE_URL` in the Vercel project environment variables to the public HTTPS URL of the deployed Express backend, without a trailing slash. For example: `https://api.example.com`.

The Express backend itself must be deployed separately to a service that can run a persistent Node.js server, unless it is explicitly converted to Vercel serverless functions.

## Database scripts and coordination

The database owner must review and execute `database/schema.sql` on a fresh database or compare it carefully with an existing shared schema. It creates the eight required InnoDB tables, constraints, indexes, `AvgScore`, and `FinalizeDecision`. `database/seed.sql` is optional sample data. `database/test_queries.sql` contains read-only checks.

Do not run `schema.sql` blindly against an existing shared database: coordinate with the teammate first, confirm compatibility, and take a backup according to your team's process. The `IF NOT EXISTS` clauses avoid ordinary table recreation, but the stored routine definitions may still need a controlled migration if routines already exist. The application never drops, resets, or overwrites the database.

## Full workflow test

After the health check succeeds, submit a paper with one or more authors. Assign two different reviewers from Assign & Review, submit two scores from 1–10 and comments, open the submission, and finalize it. Two or more reviews are required; average score 7.0 or higher is accepted and otherwise rejected. The detail screen shows reviews and audit entries.

The backend calculates token-based Jaccard similarity against earlier abstracts during submission creation and stores a `SimilarityFlag` when the score is at least 0.30. This prototype's indicator is not proof of plagiarism. If your shared schema already supplies a similarity trigger/service, keep that implementation coordinated with this API.

## Troubleshooting

- Wrong credentials: re-check `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`; remove accidental quotes or spaces.
- Inaccessible host: verify the hostname/IP and port supplied by the owner; `localhost` is not assumed.
- Firewall/network restrictions: connect to the required VPN/network and ask the owner to allow your IP and MySQL port.
- Missing database permissions: the account needs access to the named database and permission to read/write tables and execute `FinalizeDecision`.
- Mismatched schema: compare the shared database with `database/schema.sql`, especially enum values, constraints, routine names, and column names.
- Health says database unavailable: inspect the backend terminal for the MySQL error code. The backend can start without credentials, but database endpoints intentionally return a clear 503 until `.env` is configured.

## Verification

From `backend`, run `npm run check`. From `frontend`, run `npm run build`. These checks do not require database credentials. The end-to-end workflow requires the teammate's accessible database and schema, so execute it manually after coordination.

## Manual actions remaining

Obtain the five connection values from the teammate, create `backend/.env`, coordinate schema/routine setup, start both processes, and test the shared database workflow. Never commit `.env`.
