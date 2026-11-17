import { types, regionAt, validateDraft } from "./model.js";
import { buildExplorer, buildPicker, regionName } from "./maps.js";
import { readExamples, saveExample, removeExample } from "./storage.js";

const byId = id => document.getElementById(id);
const report = byId("report-dialog");
const outbox = byId("outbox-dialog");
const form = byId("report-form");
const reportStatus = byId("report-status");
const onlineStatus = byId("offline-status");
const mapStatus = byId("map-status");
const syncStatus = byId("sync-status");
const syncButton = byId("sync-reports");
const exportButton = byId("export-reports");
const examplesNode = byId("example-list");
const filter = byId("filter");
let data, explorer, picker, activeId;
let activeRegion = null;
const regionRows = new Map();
let cacheReady = false;
let syncAvailable = false;
let syncing = false;
let records = [];

for (const [category, { label }] of Object.entries(types)) {
  filter.add(new Option(label, category));
  byId("category").add(new Option(label, category));
}

function updateNetwork() {
  onlineStatus.textContent = (navigator.onLine ? "Online" : "Offline") +
    (cacheReady ? " · Offline map and form ready" : " · Offline access not yet ready");
  refreshSyncControls();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then(() => navigator.serviceWorker.ready).then(() => {
    cacheReady = true;
    updateNetwork();
  }).catch(updateNetwork);
}
updateNetwork();

async function loadJSON(file) {
  const response = await fetch("./data/" + file);
  if (!response.ok) throw new Error("Could not load " + file);
  return response.json();
}

function setSelected(id) {
  activeId = id;
  for (const node of examplesNode.querySelectorAll("button")) {
    node.setAttribute("aria-pressed", String(node.dataset.id === activeId));
  }
}

function selectRegion(name) {
  activeRegion = name === activeRegion ? null : name;
  explorer.selectRegion(activeRegion);
  if (!activeRegion) explorer.reset();
  renderExamples();
}

function setupRegions() {
  const totals = new Map();
  for (const item of data.examples) totals.set(item.region, (totals.get(item.region) ?? 0) + 1);
  const names = data.regions.features.map(regionName)
    .sort((a, b) => ((totals.get(b) ?? 0) - (totals.get(a) ?? 0)) || a.localeCompare(b));
  for (const name of names) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "region-row";
    const label = document.createElement("span");
    label.textContent = name;
    const bar = document.createElement("span");
    bar.className = "region-bar";
    bar.setAttribute("aria-hidden", "true");
    const count = document.createElement("strong");
    button.append(label, bar, count);
    button.addEventListener("click", () => selectRegion(name));
    byId("region-list").append(button);
    regionRows.set(name, { button, bar, count });
  }
}

function updateDashboard(examples) {
  const counts = new Map();
  for (const item of examples) counts.set(item.region, (counts.get(item.region) ?? 0) + 1);
  const maximum = Math.max(1, ...counts.values());
  byId("metric-total").textContent = examples.length;
  byId("metric-regions").textContent = counts.size + " / " + regionRows.size;
  byId("all-regions").disabled = !activeRegion;
  byId("examples-title").textContent = activeRegion ? activeRegion + " examples" : "Mapped examples";
  for (const [name, { button, bar, count }] of regionRows) {
    const total = counts.get(name) ?? 0;
    count.textContent = total;
    bar.style.setProperty("--report-share", (total / maximum) * 100 + "%");
    button.setAttribute("aria-pressed", String(name === activeRegion));
    button.setAttribute("aria-label", name + ", " + total + (total === 1 ? " report" : " reports"));
  }
}

function renderExamples() {
  const byType = data.examples.filter(item => filter.value === "all" || item.category === filter.value);
  const subset = byType.filter(item => !activeRegion || item.region === activeRegion);
  updateDashboard(byType);
  explorer.filter(subset.map(item => item.id));
  examplesNode.replaceChildren();
  if (!subset.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = activeRegion ? "No matching examples in this region." : "No examples for this observation type.";
    examplesNode.append(empty);
  }

  for (const item of subset) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "example";
    button.dataset.id = item.id;
    button.setAttribute("aria-pressed", String(activeId === item.id));
    const symbol = document.createElement("span");
    symbol.className = "symbol";
    symbol.dataset.category = item.category;
    symbol.textContent = types[item.category].symbol;
    symbol.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    const label = document.createElement("strong");
    label.textContent = types[item.category].label;
    const meta = document.createElement("small");
    meta.textContent = item.region;
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = "›";
    arrow.setAttribute("aria-hidden", "true");
    text.append(label, meta);
    button.append(symbol, text, arrow);
    button.addEventListener("click", () => {
      const layerButton = document.querySelector('[data-layer="observations"]');
      explorer.toggle("observations", true);
      layerButton.setAttribute("aria-pressed", "true");
      explorer.show(item.id);
      if (matchMedia("(max-width:720px)").matches) {
        byId("explore").scrollIntoView({ block: "start" });
      }
    });
    examplesNode.append(button);
  }
}

Promise.all(["neighbors.geojson", "regions.geojson", "rivers.geojson", "southern-rivers.geojson", "lakes.geojson", "labels.json", "examples.json"].map(loadJSON))
  .then(([neighbors, regions, rivers, southernRivers, lakes, labels, examples]) => {
    const mapData = { neighbors, regions, rivers, southernRivers, lakes, labels, examples };
    explorer = buildExplorer(mapData, setSelected, selectRegion);
    data = mapData;
    setupRegions();
    filter.disabled = false;
    renderExamples();
  })
  .catch(error => {
    console.error(error);
    mapStatus.textContent = "Map data are unavailable. Reopen the site online to refresh them.";
    mapStatus.hidden = false;
    examplesNode.textContent = "Example observations could not be loaded.";
  });

filter.addEventListener("change", renderExamples);
byId("all-regions").addEventListener("click", () => selectRegion(null));
byId("reset-map").addEventListener("click", () => {
  if (!explorer) return;
  if (activeRegion) selectRegion(null);
  else explorer.reset();
});
for (const button of document.querySelectorAll("[data-layer]")) {
  button.addEventListener("click", () => {
    if (!explorer) return;
    const visible = button.getAttribute("aria-pressed") === "false";
    explorer.toggle(button.dataset.layer, visible);
    button.setAttribute("aria-pressed", String(visible));
  });
}

function todayLocal() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function setPin(lat, lng) {
  const region = regionAt(lng, lat, data.regions);
  if (!region) {
    picker?.clear();
    reportStatus.textContent = "Choose a location inside the mapped Ghana boundary.";
    return;
  }
  picker?.pin(lat, lng);
  reportStatus.textContent = region + " · Example location";
}

byId("open-report").addEventListener("click", () => {
  const date = byId("date");
  date.max = todayLocal();
  if (!date.value) date.value = date.max;
  report.showModal();
  if (!data) {
    reportStatus.textContent = "The map needs to load before you can save an example.";
    return;
  }
  picker ??= buildPicker(data, ({ lat, lng }) => {
    byId("lat").value = lat.toFixed(6);
    byId("lng").value = lng.toFixed(6);
    setPin(Number(byId("lat").value), Number(byId("lng").value));
  });
  picker.show(explorer.view());
});

for (const id of ["lat", "lng"]) {
  byId(id).addEventListener("change", () => {
    if (data && byId("lat").value && byId("lng").value) {
      setPin(Number(byId("lat").value), Number(byId("lng").value));
    }
  });
}
for (const button of document.querySelectorAll("[data-close]")) {
  button.addEventListener("click", () => byId(button.dataset.close).close());
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = byId("save-report");
  if (!data) {
    reportStatus.textContent = "Wait for the map data to load before saving.";
    return;
  }
  submit.disabled = true;
  try {
    const { category, date, notes } = Object.fromEntries(new FormData(form));
    const example = validateDraft({
      id: crypto.randomUUID(), category, date, notes, fictional: true,
      lat: byId("lat").valueAsNumber, lng: byId("lng").valueAsNumber
    }, data.regions);
    await saveExample({ ...example, savedAt: new Date().toISOString(), synced: false });
    form.reset();
    picker?.clear();
    reportStatus.textContent = "";
    report.close();
    await openOutbox("Example saved on this device.");
  } catch (error) {
    reportStatus.textContent = error instanceof DOMException ? "This browser could not save the example on this device." : error.message;
  } finally {
    submit.disabled = false;
  }
});

function refreshSyncControls() {
  syncButton.hidden = !syncAvailable;
  syncButton.disabled = syncing || !navigator.onLine || !records.some(item => !item.synced);
  exportButton.disabled = !records.length || syncing;
  byId("outbox-mode").textContent = syncAvailable
    ? "Fictional reports stay on your device until you sync them to the trial database."
    : "This version keeps examples on this device. You can export them as GeoJSON.";
}

async function checkSync() {
  if (!navigator.onLine) return;
  try {
    const result = await fetch("./api/health", { cache: "no-store", signal: AbortSignal.timeout(3500) });
    if (result.ok && (await result.json()).protocol === "galamsey-demo-v1") syncAvailable = true;
  } catch {
    // The static site has no API. The outbox and export still work.
  }
  refreshSyncControls();
}

async function refreshOutbox() {
  records = (await readExamples()).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  byId("outbox-count").textContent = records.filter(item => !item.synced).length;
  const list = byId("outbox-list");
  list.replaceChildren();
  if (!records.length) {
    const placeholder = document.createElement("li");
    placeholder.className = "empty";
    placeholder.textContent = "No saved examples yet.";
    list.append(placeholder);
  }

  for (const item of records) {
    const row = document.createElement("li");
    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = types[item.category].label;
    const details = document.createElement("small");
    details.textContent = [item.region, item.date, item.synced ? "Synced" : "Saved locally"].join(" · ");
    const notes = document.createElement("small");
    notes.textContent = item.notes;
    text.append(title, details, notes);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove saved " + types[item.category].label.toLowerCase() + " example");
    remove.disabled = syncing;
    remove.addEventListener("click", async () => {
      try {
        await removeExample(item.id);
        await refreshOutbox();
        syncStatus.textContent = "Example removed from this device.";
      } catch {
        syncStatus.textContent = "Could not remove the saved example.";
      }
    });
    row.append(text, remove);
    list.append(row);
  }
  refreshSyncControls();
}

async function openOutbox(message = "") {
  outbox.showModal();
  syncStatus.textContent = message;
  try {
    await refreshOutbox();
  } catch {
    syncStatus.textContent = "This browser could not open the local outbox.";
  }
}
byId("open-outbox").addEventListener("click", () => openOutbox());

exportButton.addEventListener("click", () => {
  const features = records.map(({ lng, lat, ...properties }) => ({
    type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties
  }));
  const url = URL.createObjectURL(new Blob([JSON.stringify({ type: "FeatureCollection", features }, null, 2)], {
    type: "application/geo+json"
  }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "galamsey-watch-fictional-examples.geojson";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  syncStatus.textContent = "GeoJSON export created.";
});

syncButton.addEventListener("click", async () => {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  syncStatus.textContent = "Syncing queued examples…";
  let sent = 0;
  try {
    await refreshOutbox();
    for (const item of records.filter(item => !item.synced)) {
      const response = await fetch("./api/reports", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item),
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error("Server did not accept the example");
      const result = await response.json();
      if (result.id !== item.id) throw new Error("Missing sync receipt");
      await saveExample({ ...item, synced: true });
      sent++;
    }
    syncStatus.textContent = sent === 1 ? "1 example synced." : sent + " examples synced.";
  } catch {
    syncStatus.textContent = "Sync interrupted. " + sent + " synced. The rest are still saved on this device.";
  } finally {
    syncing = false;
    try {
      await refreshOutbox();
    } catch {
      syncStatus.textContent = "Could not refresh the outbox.";
    }
  }
});

window.addEventListener("online", () => { updateNetwork(); void checkSync(); });
window.addEventListener("offline", updateNetwork);
window.addEventListener("focus", () => { void refreshOutbox().catch(() => {}); });
void checkSync();
void refreshOutbox().catch(() => {});
