const fields = ["product", "cas", "cat", "batch", "formula", "weight", "density", "pack", "mfgDate", "retestDate"];
const $ = id => document.getElementById(id);
const repository = window.createProductionRepository();
let items = [];
let editingId = null;
let printingItem = null;
let dynamicPrintStyle = null;
let toastTimeout;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function render() {
  const query = $("search").value.trim().toLowerCase();
  const shown = items.filter(item =>
    [item.product, item.cas, item.cat, item.batch, item.formula, item.weight, item.density, item.pack, item.mfgDate, item.retestDate]
      .some(value => String(value || "").toLowerCase().includes(query))
  );

  $("tbody").innerHTML = shown.map(item => `
    <tr>
      <td>
        <div class="product">${esc(item.product)}</div>
      </td>
      <td>${esc(item.cas || "—")}</td>
      <td>${esc(item.cat || "—")}</td>
      <td>${esc(item.batch || "—")}</td>
      <td>${esc(item.formula || "—")}</td>
      <td>${esc(item.weight || "—")}</td>
      <td>${esc(item.density || "—")}</td>
      <td>${esc(item.pack || "—")}</td>
      <td>${esc(item.mfgDate || "—")}</td>
      <td>${esc(item.retestDate || "—")}</td>
      <td>
        <div class="rowactions">
          <button class="secondary small" type="button" data-print="${esc(item.id)}">Print</button>
          <button class="secondary small" type="button" data-edit="${esc(item.id)}">Edit</button>
          <button class="danger" type="button" data-delete="${esc(item.id)}">Delete</button>
        </div>
      </td>
    </tr>`).join("");

  $("empty").hidden = shown.length > 0;
  $("totalCount").textContent = items.length;
  $("batchCount").textContent = items.filter(item => String(item.batch || "").trim()).length;
  $("catCount").textContent = items.filter(item => String(item.cat || "").trim()).length;
}

function labelMarkup(item, size) {
  const showDates = !["4x2", "1x3", "3x1"].includes(size);
  const labelFields = [
    { label: "Pack Size", value: item.pack || "—" },
    { label: "CAS No.", value: item.cas || "—" },
    ...(item.cat || size !== "6x4" ? [{ label: "CAT No.", value: item.cat || "—" }] : []),
    { label: "Batch No.", value: item.batch || "—" },
    { label: "M. F.", value: item.formula || "—" },
    { label: "Mol. Wt.", value: item.weight || "—" },
    ...(item.density || size === "6x4" ? [{ label: "Density", value: item.density || "—" }] : []),
    ...(showDates ? [
      { label: "Mfg Date", value: item.mfgDate || "—" },
      { label: "Retest Date", value: item.retestDate || "—" },
    ] : []),
  ];
  if (size === "6x4") {
    const order = ["CAS No.", "Pack Size", "Batch No.", "Mol. Wt.", "Density", "M. F.", "Mfg Date", "Retest Date", "CAT No."];
    labelFields.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  }

  return `
    <div class="label-frame">
      <div class="label-brand">
        <img class="label-logo" src="./images/neo-log.jpeg" alt="Neo Fine Chemicals logo">
        <div class="label-company">Neo Fine Chemicals</div>
      </div>
      <div class="label-heading">
        <div class="label-product">${esc(item.product || "—")}</div>
      </div>
      <div class="label-grid">
        ${labelFields.map(field => `<div class="label-field"><strong>${field.label}</strong><span>${esc(field.value)}</span></div>`).join("")}
      </div>
      <div class="label-storage">For Laboratory Use Only · Store at Room Temperature</div>
      <div class="label-bottom">
        ${showDates ? `<div class="label-footer">
          <strong>Disclaimer</strong>
          <span>Keep cool and away from heat. Wear suitable personal protective equipment. Do not breathe dust or mists. Dispose of contents and container in accordance with local, state, and federal regulations.</span>
        </div>` : ""}
        <div class="label-hazards" aria-label="Hazard symbols">
          <img src="./images/hazard-flammable.png" alt="Flammable hazard">
          <img src="./images/hazard-exclamation.png" alt="Warning hazard">
        </div>
      </div>
      <div class="label-address">H No. 3-13-142/280, Gokul Nagar, Mallapur, Hyderabad, Medchal Malkajgiri, Telangana 500076</div>
    </div>
  `;
}

function updateLabelPreview() {
  if (!printingItem) return;
  const size = $("labelSize").value;
  ["previewSheet", "printSheet"].forEach(id => {
    const sheet = $(id);
    sheet.className = `label-sheet size-${size}`;
    sheet.innerHTML = labelMarkup(printingItem, size);
  });
}

function openPrint(item) {
  printingItem = item;
  $("labelSize").value = "4x3";
  updateLabelPreview();
  $("printModal").classList.add("open");
}

function closePrint() {
  $("printModal").classList.remove("open");
  printingItem = null;
}

function openForm(item) {
  editingId = item ? item.id : null;
  $("modalTitle").textContent = item ? "Edit production item" : "Add production item";
  fields.forEach(field => { $(field).value = item ? (item[field] || "") : ""; });
  $("modalback").classList.add("open");
  $("product").focus();
}

function closeForm() {
  $("modalback").classList.remove("open");
  $("itemForm").reset();
  editingId = null;
}

function toast(message, isError = false) {
  const element = $("toast");
  element.textContent = message;
  element.style.background = isError ? "#8b1e16" : "";
  element.style.display = "block";
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { element.style.display = "none"; }, 3200);
}

function showError(error) {
  console.error(error);
  toast(error instanceof Error ? error.message : "An unexpected error occurred.", true);
}

function finishPrinting() {
  document.body.classList.remove("printing-label");
  if (dynamicPrintStyle) {
    dynamicPrintStyle.remove();
    dynamicPrintStyle = null;
  }
}

$("topAdd").onclick = $("addBtn").onclick = () => openForm(null);
$("closeModal").onclick = $("cancelBtn").onclick = closeForm;
$("closePrintModal").onclick = closePrint;
$("labelSize").addEventListener("change", updateLabelPreview);
$("search").addEventListener("input", render);
$("modalback").addEventListener("click", event => {
  if (event.target === $("modalback")) closeForm();
});
$("printModal").addEventListener("click", event => {
  if (event.target === $("printModal")) closePrint();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeForm();
    closePrint();
  }
});
window.addEventListener("afterprint", finishPrinting);

$("printNow").onclick = () => {
  if (!printingItem) return;
  const dimensions = { "6x4": [6, 4], "4x6": [4, 6], "4x3": [4, 3], "4x2": [4, 2], "1x3": [1, 3], "3x1": [3, 1] }[$("labelSize").value];
  if (!dimensions) {
    showError(new Error("Select a supported label size before printing."));
    return;
  }
  if (dynamicPrintStyle) dynamicPrintStyle.remove();
  dynamicPrintStyle = document.createElement("style");
  dynamicPrintStyle.textContent = `@page { size: ${dimensions[0]}in ${dimensions[1]}in; margin: 0; }`;
  document.head.appendChild(dynamicPrintStyle);
  document.documentElement.style.setProperty("--label-width", `${dimensions[0]}in`);
  document.documentElement.style.setProperty("--label-height", `${dimensions[1]}in`);
  document.body.classList.add("printing-label");
  window.print();
  setTimeout(finishPrinting, 1500);
};

$("itemForm").addEventListener("submit", async event => {
  event.preventDefault();
  const record = Object.fromEntries(fields.map(field => [field, $(field).value.trim()]));
  if (!record.product) {
    $("product").focus();
    return;
  }

  try {
    if (editingId) {
      await repository.update(editingId, record);
      toast("Production item updated.");
    } else {
      await repository.create(record);
      toast("Production item added.");
    }
    items = await repository.list();
    render();
    closeForm();
  } catch (error) {
    showError(error);
  }
});

$("tbody").addEventListener("click", async event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const printButton = target.closest("[data-print]");
  const editButton = target.closest("[data-edit]");
  const deleteButton = target.closest("[data-delete]");

  if (printButton) {
    const item = items.find(record => record.id === printButton.dataset.print);
    if (item) openPrint(item);
  } else if (editButton) {
    const item = items.find(record => record.id === editButton.dataset.edit);
    if (item) openForm(item);
  } else if (deleteButton) {
    const item = items.find(record => record.id === deleteButton.dataset.delete);
    if (item && confirm(`Delete "${item.product}"? This cannot be undone.`)) {
      try {
        await repository.delete(item.id);
        items = await repository.list();
        render();
        toast("Production item deleted.");
      } catch (error) {
        showError(error);
      }
    }
  }
});

$("exportBtn").onclick = () => {
  const columns = [
    ["Product Name", "product"],
    ["CAS NO:", "cas"],
    ["CAT NO:", "cat"],
    ["BATCH NO:", "batch"],
    ["M. F", "formula"],
    ["Mol . Wt", "weight"],
    ["Density", "density"],
    ["Pack size", "pack"],
    ["Mfg Date", "mfgDate"],
    ["Retest Date", "retestDate"],
  ];
  const quote = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [
    columns.map(([label]) => quote(label)).join(","),
    ...items.map(item => columns.map(([, field]) => quote(item[field])).join(",")),
  ].join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "chemical-production-items.csv";
  link.click();
  URL.revokeObjectURL(url);
  toast("CSV export prepared.");
};

$("exportJsonBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "chemical-production-items.json";
  link.click();
  URL.revokeObjectURL(url);
  toast("JSON export prepared.");
};

async function initialize() {
  try {
    items = await repository.list();
    render();
    if (window.location.protocol === "file:") {
      $("storageNotice").textContent = "Direct file mode stores records separately in this browser. Run start-server.ps1 and open http://localhost:8000/ to share records across browsers using the JSON data file.";
    } else {
      $("storageNotice").textContent = "Records are shared by browsers using this local server and saved in data/production-items.json. Keep this computer and server running while using the app.";
    }
  } catch (error) {
    showError(error);
  }
}

initialize();
