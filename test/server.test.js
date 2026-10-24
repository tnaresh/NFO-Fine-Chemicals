const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, before, test } = require("node:test");

process.env.APP_USERNAME = "test-user";
process.env.APP_PASSWORD = "test-password-long-enough";
process.env.APP_SECRET = crypto.randomBytes(32).toString("hex");

const records = new Map();
const fakePool = {
  async query(sql, values = []) {
    const query = sql.replace(/\s+/g, " ").trim();
    if (query.startsWith("CREATE TABLE") || query.startsWith("CREATE INDEX") || query === "SELECT 1") {
      return { rows: [{ "?column?": 1 }], rowCount: 1 };
    }
    if (query.startsWith("SELECT id, product")) {
      return { rows: [...records.values()], rowCount: records.size };
    }
    if (query.startsWith("INSERT INTO production_items")) {
      const [id, product, cas, cat, batch, formula, weight, density, pack, mfgDate, retestDate] = values;
      const record = { id, product, cas, cat, batch, formula, weight, density, pack, mfgDate, retestDate };
      records.set(id, record);
      return { rows: [record], rowCount: 1 };
    }
    if (query.startsWith("UPDATE production_items")) {
      const [id, product, cas, cat, batch, formula, weight, density, pack, mfgDate, retestDate] = values;
      if (!records.has(id)) return { rows: [], rowCount: 0 };
      const record = { id, product, cas, cat, batch, formula, weight, density, pack, mfgDate, retestDate };
      records.set(id, record);
      return { rows: [record], rowCount: 1 };
    }
    if (query.startsWith("DELETE FROM production_items")) {
      return { rows: [], rowCount: Number(records.delete(values[0])) };
    }
    throw new Error(`Unexpected SQL in API test: ${query}`);
  },
  async end() {},
};

const poolPath = require.resolve("../db/pool");
require.cache[poolPath] = {
  id: poolPath,
  filename: poolPath,
  loaded: true,
  exports: fakePool,
};

const { app } = require("../server");
let server;
let baseUrl;
let token;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await fakePool.end();
});

async function jsonRequest(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, options);
  return { response, payload: await response.json() };
}

test("requires login before accessing production records", async () => {
  const status = await jsonRequest("/api/auth/status");
  assert.deepEqual(status.payload, { required: true });

  const denied = await jsonRequest("/api/items");
  assert.equal(denied.response.status, 401);

  const invalidLogin = await jsonRequest("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "test-user", password: "wrong-password" }),
  });
  assert.equal(invalidLogin.response.status, 401);

  const login = await jsonRequest("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "test-user", password: "test-password-long-enough" }),
  });
  assert.equal(login.response.status, 200);
  assert.equal(typeof login.payload.token, "string");
  token = login.payload.token;
});

test("validates and persists a production item through CRUD endpoints", async () => {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const invalid = await jsonRequest("/api/items", {
    method: "POST",
    headers,
    body: JSON.stringify({ product: "x".repeat(151) }),
  });
  assert.equal(invalid.response.status, 400);
  const invalidDate = await jsonRequest("/api/items", {
    method: "POST",
    headers,
    body: JSON.stringify({ product: "Date validation test", mfgDate: "x".repeat(41) }),
  });
  assert.equal(invalidDate.response.status, 400);

  const values = {
    product: "PostgreSQL API test item",
    cas: "CAS-123",
    cat: "CAT-123",
    batch: "BATCH-123",
    formula: "H2O",
    weight: "18.02 g/mol",
    density: "1.00 g/cm3",
    pack: "250 mL",
    mfgDate: "24-OCT-2026",
    retestDate: "24-OCT-2027",
  };
  const created = await jsonRequest("/api/items", {
    method: "POST",
    headers,
    body: JSON.stringify(values),
  });
  assert.equal(created.response.status, 201);
  assert.deepEqual({ ...created.payload, id: undefined }, { ...values, id: undefined });

  const list = await jsonRequest("/api/items", { headers });
  assert.equal(list.payload.length, 1);
  assert.equal(list.payload[0].id, created.payload.id);
  assert.equal(list.payload[0].mfgDate, values.mfgDate);
  assert.equal(list.payload[0].retestDate, values.retestDate);

  const updated = await jsonRequest(`/api/items/${created.payload.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ ...values, product: "Updated API test item" }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.payload.product, "Updated API test item");
  assert.equal(updated.payload.mfgDate, values.mfgDate);
  assert.equal(updated.payload.retestDate, values.retestDate);

  const removed = await jsonRequest(`/api/items/${created.payload.id}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(removed.response.status, 200);

  const missing = await jsonRequest(`/api/items/${created.payload.id}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(missing.response.status, 404);
});

test("does not expose the shared JSON data folder", async () => {
  const response = await fetch(`${baseUrl}/data/production-items.json`);
  assert.equal(response.status, 404);
});
