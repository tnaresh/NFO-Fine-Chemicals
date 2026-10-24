const fs = require("node:fs/promises");
const pool = require("../db/pool");
const initializeDatabase = require("../db/initialize");

const filePath = process.argv[2];

async function main() {
  if (!filePath) {
    throw new Error("Usage: npm run import:json -- <path-to-exported-json>");
  }

  const records = JSON.parse(await fs.readFile(filePath, "utf8"));
  if (!Array.isArray(records)) {
    throw new Error("The input file must contain a JSON array of production records.");
  }

  await initializeDatabase();
  const client = await pool.connect();
  let inserted = 0;

  try {
    await client.query("BEGIN");
    for (const [index, item] of records.entries()) {
      if (!item || typeof item.id !== "string" || typeof item.product !== "string" || !item.product.trim()) {
        throw new Error(`Record ${index + 1} must have a string id and a non-empty product name.`);
      }

      const fields = ["product", "cas", "cat", "batch", "formula", "weight", "density", "pack", "mfgDate", "retestDate"];
      const databaseFields = fields.map(field => ["mfgDate", "retestDate"].includes(field) ? `"${field}"` : field);
      const values = fields.map(field => {
        const value = item[field] ?? "";
        if (typeof value !== "string") throw new Error(`Record ${index + 1}: ${field} must be text.`);
        return value;
      });
      const placeholders = Array.from({ length: fields.length + 1 }, (_, valueIndex) => `$${valueIndex + 1}`);

      const result = await client.query(`
        INSERT INTO production_items (id, ${databaseFields.join(", ")})
        VALUES (${placeholders.join(", ")})
        ON CONFLICT (id) DO NOTHING
      `, [item.id, ...values]);
      inserted += result.rowCount;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  console.log(`Imported ${inserted} new records. Existing IDs were left unchanged.`);
}

main()
  .catch(error => {
    console.error("JSON import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
