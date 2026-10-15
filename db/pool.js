const fs = require("node:fs");
const { Pool } = require("pg");

const sslMode = (process.env.PGSSLMODE || "require").toLowerCase();
const ssl = sslMode === "disable"
  ? false
  : {
      rejectUnauthorized: true,
      ...(process.env.PGSSLROOTCERT
        ? { ca: fs.readFileSync(process.env.PGSSLROOTCERT, "utf8") }
        : {}),
    };

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.PGHOST || undefined,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || undefined,
  user: process.env.PGUSER || undefined,
  password: process.env.PGPASSWORD || undefined,
  ssl,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", error => {
  console.error("Unexpected idle PostgreSQL connection error:", error.message);
});

module.exports = pool;
