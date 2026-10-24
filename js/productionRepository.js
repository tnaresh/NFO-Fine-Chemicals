const STORAGE_KEY = "chemicalProductionItems_v1";
const TOKEN_KEY = "neoFineApiToken";

const initialItems = [
  {
    id: "sample-1",
    product: "Iron(II) sulfate heptahydrate",
    cas: "7782-63-0",
    cat: "",
    batch: "N2320210",
    formula: "FeSO₄·7H₂O",
    weight: "278.02 g/mol",
    density: "",
    pack: "500 gm",
  },
  {
    id: "sample-2",
    product: "Chloral Hydrate",
    cas: "7789-20-0",
    cat: "",
    batch: "NE05714",
    formula: "In(NO₃)₃·xH₂O",
    weight: "300.83 g/mol",
    density: "",
    pack: "5 LTR",
  },
];

function normalizeItems(items) {
  if (!Array.isArray(items) || items.some(item =>
    !item || typeof item !== "object" || typeof item.id !== "string" ||
    typeof item.product !== "string"
  )) {
    throw new Error("Production records have an unexpected format.");
  }

  return items.map(item => ({
    ...item,
    cat: item.cat ?? "",
    density: item.density ?? "",
    mfgDate: item.mfgDate ?? "",
    retestDate: item.retestDate ?? "",
  }));
}

function readLocalItems() {
  let stored;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    throw new Error("Could not read production records from this browser.", { cause: error });
  }

  if (stored === null) {
    writeLocalItems(initialItems);
    return initialItems.map(item => ({ ...item }));
  }

  let parsed;
  try {
    parsed = JSON.parse(stored);
  } catch (error) {
    throw new Error("Saved production records are not valid JSON. Export or repair the browser data before continuing.", { cause: error });
  }

  return normalizeItems(parsed);
}

function writeLocalItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    throw new Error("Could not save production records to this browser.", { cause: error });
  }
}

async function requestApi(path, options = {}) {
  let response;
  const token = sessionStorage.getItem(TOKEN_KEY);
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error("Could not reach the data server. Check that the server is running and try again.", { cause: error });
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("The local data server returned an invalid response.", { cause: error });
  }

  if (!response.ok) {
    if (response.status === 401 && path !== "/api/login") {
      sessionStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("sessionexpired"));
    }
    const error = new Error(payload.error || `The local data server returned error ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function createProductionRepository() {
  const useLocalFileStorage = window.location.protocol === "file:";

  return {
    async authStatus() {
      if (useLocalFileStorage) return { required: false };
      try {
        return await requestApi("/api/auth/status");
      } catch (error) {
        if (error.status === 404) return { required: false };
        throw error;
      }
    },
    async login(username, password) {
      const payload = await requestApi("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      sessionStorage.setItem(TOKEN_KEY, payload.token);
    },
    logout() {
      sessionStorage.removeItem(TOKEN_KEY);
    },
    async list() {
      if (useLocalFileStorage) return readLocalItems();
      return normalizeItems(await requestApi("/api/items"));
    },
    async create(record) {
      if (useLocalFileStorage) {
        const created = { ...record, id: createId() };
        writeLocalItems([created, ...readLocalItems()]);
        return { ...created };
      }

      return normalizeItems([await requestApi("/api/items", {
        method: "POST",
        body: JSON.stringify(record),
      })])[0];
    },
    async update(id, record) {
      if (useLocalFileStorage) {
        const items = readLocalItems();
        if (!items.some(item => item.id === id)) {
          throw new Error("The production item could not be found.");
        }
        writeLocalItems(items.map(item => item.id === id ? { ...item, ...record, id } : item));
        return { ...record, id };
      }

      return normalizeItems([await requestApi(`/api/items/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(record),
      })])[0];
    },
    async delete(id) {
      if (useLocalFileStorage) {
        const items = readLocalItems();
        const nextItems = items.filter(item => item.id !== id);
        if (nextItems.length === items.length) {
          throw new Error("The production item could not be found.");
        }
        writeLocalItems(nextItems);
        return;
      }

      await requestApi(`/api/items/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}

window.createProductionRepository = createProductionRepository;
