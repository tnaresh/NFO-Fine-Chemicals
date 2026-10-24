# Neo Fine Chemicals — Production Register

Production register and dashboard for Neo Fine Chemicals, with search, add/edit/delete, CSV/JSON export, and printable product labels. Each record has a product name plus CAS NO, CAT NO, BATCH NO, M. F, Mol . Wt, Density, Pack size, Mfg Date, and Retest Date. Label sizes include 6 × 4, 4 × 6, 4 × 3, 4 × 2, 1 × 3, and 3 × 1 inches. The API, local JSON server, and JSON import tool preserve both date fields.

## AWS deployment (Elastic Beanstalk + RDS PostgreSQL)

The AWS backend is a Node.js API backed by PostgreSQL. The deployment target for this branch is AWS Elastic Beanstalk and Amazon RDS PostgreSQL in **Asia Pacific (Mumbai), `ap-south-1`**. This repository prepares the app; it does not create AWS resources or deploy them.

1. Create an Elastic Beanstalk Node.js environment in `ap-south-1`.
2. Create an RDS PostgreSQL database in the same region and VPC. Keep it **not publicly accessible**.
3. Allow inbound PostgreSQL traffic on port `5432` to the RDS security group only from the Elastic Beanstalk application/instance security group. The app server must be able to reach the RDS private endpoint.
4. In the Elastic Beanstalk environment, configure these environment properties. Use AWS Secrets Manager or another approved secret-management process for passwords and signing keys; never commit real values.

   | Name | Value |
   | --- | --- |
   | `PGHOST` | RDS endpoint hostname |
   | `PGPORT` | `5432` |
   | `PGDATABASE` | Database name |
   | `PGUSER` | Database application user |
   | `PGPASSWORD` | Database password (secret) |
   | `PGSSLMODE` | `require` |
   | `APP_USERNAME` | Application sign-in username |
   | `APP_PASSWORD` | Application sign-in password, at least 12 characters (secret) |
   | `APP_SECRET` | Random signing secret, at least 32 characters (secret) |

   Give the application database user only the permissions it needs on the application database. Do not enable public access to the database. If the Node.js runtime does not trust the active Amazon RDS CA, provide the current Amazon RDS CA bundle on the instance and set `PGSSLROOTCERT` to its path.
5. Deploy the repository branch to Elastic Beanstalk. The server creates or updates the `production_items` table on startup; `.ebextensions/01-app.config` configures the `/health` endpoint and production PostgreSQL TLS mode.
6. Open the Elastic Beanstalk HTTPS URL and sign in using the configured application username and password.

The sign-in token expires after 8 hours. Signing out or closing the browser session requires signing in again. Login attempts are rate limited. The RDS endpoint, database credentials, and application secrets are runtime configuration only and are not stored in this repository.

## Move existing records to RDS

The live local file `data/production-items.json` and browser-local records are intentionally excluded from Git. Export the records using the app's **Export JSON** button. From a trusted machine that has network access to the private RDS endpoint, set the database and SSL environment variables, then run:

```powershell
npm install
npm run import:json -- C:\path\to\chemical-production-items.json
```

The import is transactional. It inserts records whose IDs are new and leaves existing IDs unchanged; it does not overwrite records already in PostgreSQL. Do not expose RDS publicly just to run an import. Back up/export records before migration.

## Local Windows use (JSON file)

For the existing local-only setup, double-click **Start Neo Fine Chemicals.bat**. Keep its PowerShell window open while using the app. This starts the JSON server at <http://localhost:8000>; records are stored in `data/production-items.json`. This local JSON server is separate from AWS and does not sync with RDS.

Opening `index.html` directly also remains available for a single browser, but it stores records in that browser's `localStorage` and does not sync with the local JSON server or AWS.

### Windows 7

Run **Start Neo Fine Chemicals.bat** and use Chrome or Firefox; the launcher opens one of those browsers when installed. Internet Explorer is not supported, and opening `index.html` directly can trigger Internet Explorer's local-script security restriction. The server supports the Windows PowerShell 2.0 included with Windows 7 by using the .NET Framework `System.Web.Extensions` JSON serializer; if that assembly is unavailable, install or enable the .NET Framework 3.5 feature.

Windows 7 is no longer supported by Microsoft, and current browser releases do not support it. Any browser version that still runs on Windows 7 is outdated and may have security vulnerabilities. Use this setup only on a trusted computer and upgrade Windows for continued secure use.

## Project layout

- `index.html`, `styles.css`, `js/` — static UI and print layouts.
- `server.js` — authenticated Node.js HTTP API and static site server for AWS.
- `db/schema.sql`, `db/pool.js`, `db/initialize.js` — PostgreSQL schema and connection setup.
- `scripts/import-json.js` — one-time JSON-to-PostgreSQL import tool.
- `.ebextensions/01-app.config` — Elastic Beanstalk health-check and runtime settings.
- `start-server.ps1`, `Start Neo Fine Chemicals.bat` — local JSON-file server and Windows launcher.
- `data/production-items.example.json` — clean sample data; the live production JSON file is ignored by Git.

## Run the AWS API locally

Requires Node.js 20 or later and a reachable PostgreSQL database. Set the `PG*` and `APP_*` environment variables listed above in the current terminal, install dependencies with `npm install`, then run `npm start`. Do not use production passwords in an untrusted development environment.
