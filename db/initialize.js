const fs = require("node:fs/promises");
const path = require("node:path");
const pool = require("./pool");

async function initializeDatabase() {
  const schema = await fs.readFile(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
  await pool.query("SELECT 1");
}

module.exports = initializeDatabase;
