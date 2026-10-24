const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");
const pool = require("./db/pool");
const initializeDatabase = require("./db/initialize");

const app = express();
const root = __dirname;
const tokenLifetimeMs = 8 * 60 * 60 * 1000;
const username = process.env.APP_USERNAME || "";
const password = process.env.APP_PASSWORD || "";
const appSecret = process.env.APP_SECRET || "";
const itemFields = ["product", "cas", "cat", "batch", "formula", "weight", "density", "pack", "mfgDate", "retestDate"];
const databaseField = field => ["mfgDate", "retestDate"].includes(field) ? `"${field}"` : field;
const fieldLimits = {
  product: 150,
  cas: 40,
  cat: 60,
  batch: 60,
  formula: 100,
  weight: 60,
  density: 60,
  pack: 60,
  mfgDate: 40,
  retestDate: 40,
};

if (!username || password.length < 12 || appSecret.length < 32) {
  throw new Error("Configure APP_USERNAME, an APP_PASSWORD of at least 12 characters, and an APP_SECRET of at least 32 characters.");
}

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'none'"],
    },
  },
}));
app.use(express.json({ limit: "32kb", strict: true }));

function safeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

function sign(payload) {
  return crypto.createHmac("sha256", appSecret).update(payload).digest("base64url");
}

function createAccessToken() {
  const payload = Buffer.from(JSON.stringify({
    sub: username,
    exp: Date.now() + tokenLifetimeMs,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function hasValidAccessToken(request) {
  const authorization = request.get("authorization") || "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
  if (!match) return false;

  const [payload, signature] = match[1].split(".");
  if (!safeEqual(signature, sign(payload))) return false;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return claims.sub === username && Number.isFinite(claims.exp) && claims.exp > Date.now();
  } catch {
    return false;
  }
}

function requireAuthentication(request, response, next) {
  if (hasValidAccessToken(request)) {
    next();
    return;
  }
  response.status(401).json({ error: "Sign in is required." });
}

function validateRecord(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "A production record is required." };
  }
  if (typeof body.product !== "string" || !body.product.trim()) {
    return { error: "Product name is required." };
  }

  const record = {};
  for (const field of itemFields) {
    const value = body[field] ?? "";
    if (typeof value !== "string") return { error: `${field} must be text.` };
    if (value.length > fieldLimits[field]) return { error: `${field} must be ${fieldLimits[field]} characters or fewer.` };
    record[field] = value.trim();
  }
  return { record };
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Wait 15 minutes and try again." },
});

app.get("/health", async (request, response, next) => {
  try {
    await pool.query("SELECT 1");
    response.status(200).json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/status", (request, response) => {
  response.json({ required: true });
});

app.post("/api/login", loginLimiter, (request, response) => {
  const suppliedUsername = typeof request.body?.username === "string" ? request.body.username : "";
  const suppliedPassword = typeof request.body?.password === "string" ? request.body.password : "";
  if (!safeEqual(suppliedUsername, username) || !safeEqual(suppliedPassword, password)) {
    response.status(401).json({ error: "Incorrect username or password." });
    return;
  }
  response.json({ token: createAccessToken(), expiresIn: tokenLifetimeMs });
});

app.get("/api/items", requireAuthentication, async (request, response, next) => {
  try {
    const result = await pool.query(`
      SELECT id, ${itemFields.map(field => `${databaseField(field)} AS "${field}"`).join(", ")}
      FROM production_items
      ORDER BY updated_at DESC, created_at DESC
    `);
    response.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/items", requireAuthentication, async (request, response, next) => {
  const { record, error } = validateRecord(request.body);
  if (error) {
    response.status(400).json({ error });
    return;
  }

  try {
    const id = crypto.randomUUID();
    const values = itemFields.map(field => record[field]);
    const placeholders = Array.from({ length: itemFields.length + 1 }, (_, index) => `$${index + 1}`);
    const databaseFields = itemFields.map(databaseField);
    const result = await pool.query(`
      INSERT INTO production_items (id, ${databaseFields.join(", ")})
      VALUES (${placeholders.join(", ")})
      RETURNING id, ${itemFields.map(field => `${databaseField(field)} AS "${field}"`).join(", ")}
    `, [id, ...values]);
    response.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.put("/api/items/:id", requireAuthentication, async (request, response, next) => {
  const { record, error } = validateRecord(request.body);
  if (error) {
    response.status(400).json({ error });
    return;
  }

  try {
    const assignments = itemFields.map((field, index) => `${databaseField(field)} = $${index + 2}`);
    const result = await pool.query(`
      UPDATE production_items
      SET ${assignments.join(", ")}, updated_at = NOW()
      WHERE id = $1
      RETURNING id, ${itemFields.map(field => `${databaseField(field)} AS "${field}"`).join(", ")}
    `, [request.params.id, ...itemFields.map(field => record[field])]);
    if (result.rowCount === 0) {
      response.status(404).json({ error: "The production item could not be found." });
      return;
    }
    response.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/items/:id", requireAuthentication, async (request, response, next) => {
  try {
    const result = await pool.query("DELETE FROM production_items WHERE id = $1", [request.params.id]);
    if (result.rowCount === 0) {
      response.status(404).json({ error: "The production item could not be found." });
      return;
    }
    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (request, response) => {
  response.status(404).json({ error: "API endpoint not found." });
});
app.use("/data", (request, response) => {
  response.sendStatus(404);
});
app.get("/", (request, response) => {
  response.sendFile(path.join(root, "index.html"));
});
app.use("/images", express.static(path.join(root, "images"), { dotfiles: "deny", index: false }));
app.use("/js", express.static(path.join(root, "js"), { dotfiles: "deny", index: false }));
app.use("/styles.css", express.static(path.join(root, "styles.css"), { dotfiles: "deny", index: false }));
app.use((request, response) => {
  response.status(404).send("Not found.");
});

app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error.type === "entity.parse.failed") {
    response.status(400).json({ error: "Request body must contain valid JSON." });
    return;
  }
  console.error("Request failed:", error.message);
  response.status(500).json({ error: "The request could not be completed. Check the server logs." });
});

async function start() {
  await initializeDatabase();
  const port = Number(process.env.PORT || 8080);
  app.listen(port, "0.0.0.0", () => {
    console.log(`Neo Fine Chemicals listening on port ${port}.`);
  });
}

if (require.main === module) {
  start().catch(error => {
    console.error("Could not start Neo Fine Chemicals:", error.message);
    process.exitCode = 1;
  });

  process.on("SIGTERM", async () => {
    await pool.end();
    process.exit(0);
  });
}

module.exports = { app, start };
