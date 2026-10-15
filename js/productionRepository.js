const STORAGE_KEY = "chemicalProductionItems_v1";

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
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error("Could not reach the local data server. Start start-server.ps1 and open http://localhost:8000.", { cause: error });
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("The local data server returned an invalid response.", { cause: error });
  }

  if (!response.ok) {
    throw new Error(payload.error || `The local data server returned error ${response.status}.`);
  }

  return payload;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function createProductionRepository() {
  const useLocalFileStorage = window.location.protocol === "file:";

  return {
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
