import { types } from "./model.js";

const L = window.L;
const bounds = [[4.69, -3.28], [11.18, 1.22]];
const extent = [[0.8, -12], [17.2, 8]];
const colors = ["#cbd9b2", "#d8dfba", "#c0d3a9", "#dbe3c2", "#c8d8b7"];
const attribution = '<a href="./data/SOURCES.txt">Map sources</a> · geoBoundaries · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · Natural Earth';

const osmCredit = '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>';
const basemaps = {
  offline: { label: "Offline map" },
  satellite: {
    label: "Satellite · 2024",
    url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg",
    maxNativeZoom: 14,
    attribution: '<a href="https://cloudless.eox.at">EOxCloudless</a> by <a href="https://eox.at">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2024)'
  },
  streets: { label: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxNativeZoom: 19, attribution: osmCredit },
  terrain: {
    label: "OpenTopoMap",
    url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    maxNativeZoom: 15,
    attribution: osmCredit + ' · SRTM, Sonny · <a href="https://opentopomap.org/">© OpenTopoMap</a> (CC BY-SA)'
  }
};

export const regionName = feature => feature.properties.shapeName.replace(/ Region$/, "");

export function fitGhana(map, padding = 18) {
  map.stop();
  map.fitBounds(bounds, { padding: [padding, padding], animate: false });
}

function labelMarker(latlng, name, kind = "") {
  const label = document.createElement("span");
  label.textContent = name;
  return L.marker(latlng, {
    icon: L.divIcon({ className: "geo-label " + kind, html: label, iconSize: [100, 16], iconAnchor: [50, 8] }),
    interactive: false,
    keyboard: false
  });
}

function pinIcon(category, symbol, size) {
  const glyph = document.createElement("span");
  glyph.textContent = symbol;
  return L.divIcon({ className: "map-marker " + category, html: glyph, iconSize: [size, size] });
}

function drawBase(map, data, showLabel, onRegion) {
  L.control.scale({ imperial: false, maxWidth: 85 }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution(attribution);
  map.createPane("reference-base").style.zIndex = 190;
  L.geoJSON(data.neighbors, {
    pane: "reference-base", interactive: false, style: { color: "#a3aba0", weight: 1, fillColor: "#e9e7d4", fillOpacity: 1 }
  }).addTo(map);

  let basemap = "offline";
  let selected = null;
  const regionLayers = new Map();
  const shapes = L.geoJSON(data.regions, {
    interactive: Boolean(onRegion),
    style: regionStyle,
    onEachFeature(feature, layer) {
      const name = regionName(feature);
      regionLayers.set(name, layer);
      if (onRegion) {
        const label = document.createElement("span");
        label.textContent = name;
        layer.bindTooltip(label, { sticky: true });
        layer.on("click", () => onRegion(name));
      }
    }
  });
  const regions = L.layerGroup([shapes]).addTo(map);

  function regionStyle(feature) {
    const active = regionName(feature) === selected;
    return {
      color: active ? "#e0a341" : basemap === "satellite" ? "#ecedcd" : "#6c8978",
      weight: active ? 3 : 1.15,
      fillColor: active ? "#dca64e" : colors[feature.properties.shapeName.length % colors.length],
      fillOpacity: basemap === "offline" ? (active ? .78 : 1) : (active ? .23 : 0)
    };
  }
  const water = L.layerGroup([
    L.geoJSON(data.rivers, {
      interactive: false,
      style: { color: "#70a7b0", weight: 1, opacity: .86 }
    }),
    L.geoJSON(data.southernRivers, {
      interactive: false,
      style: { color: "#5d96a9", weight: 1.35, opacity: .94 }
    }),
    L.geoJSON(data.lakes, {
      interactive: false, style: { color: "#729fa8", weight: .6, fillColor: "#a6cbd3", fillOpacity: 1 }
    })
  ]).addTo(map);
  let updateLabels = () => {};
  if (showLabel) {
    const placeLabels = L.layerGroup().addTo(map);
    const waterLabels = L.layerGroup().addTo(water);
    const regionLabels = L.layerGroup().addTo(regions);
    updateLabels = () => {
      placeLabels.clearLayers();
      waterLabels.clearLayers();
      regionLabels.clearLayers();
      if (basemap !== "offline") return;
      const zoom = map.getZoom();
      for (const [lat, lng, text, kind, minZoom] of data.labels) {
        if (zoom < minZoom) continue;
        const layer = { water: waterLabels, region: regionLabels }[kind] ?? placeLabels;
        labelMarker([lat, lng], text, kind).addTo(layer);
      }
    };
    map.on("zoomend", updateLabels);
    updateLabels();
  }
  function selectRegion(name) {
    selected = name;
    shapes.setStyle(regionStyle);
    if (!name) return;
    const layer = regionLayers.get(name);
    if (map.hasLayer(regions)) layer.bringToFront();
    map.fitBounds(layer.getBounds(), { padding: [32, 32], maxZoom: 10, animate: false });
  }

  return {
    regions, water, selectRegion,
    setBasemap(name) {
      basemap = name;
      shapes.setStyle(regionStyle);
      updateLabels();
    }
  };
}

function basemapControl(map, layers, selectId) {
  const select = document.getElementById(selectId);
  let tiles;
  let name = "offline";
  for (const [key, item] of Object.entries(basemaps)) select.add(new Option(item.label, key));
  const status = document.createElement("span");
  status.className = "sr-only";
  status.setAttribute("role", "status");
  select.after(status);

  function set(key) {
    if (!navigator.onLine && key !== "offline") {
      key = "offline";
      status.textContent = "Using the offline basemap while disconnected.";
    } else {
      status.textContent = "";
    }
    select.value = key;
    if (key === name) return;
    if (tiles) map.removeLayer(tiles);
    name = key;
    layers.setBasemap(key);
    const item = basemaps[key];
    if (!item.url) return;
    tiles = L.tileLayer(item.url, {
      maxNativeZoom: item.maxNativeZoom, maxZoom: 20,
      noWrap: true, attribution: item.attribution
    }).addTo(map);
  }

  select.addEventListener("change", () => set(select.value));
  window.addEventListener("offline", () => set("offline"));
  return { set, current: () => name };
}

function initialize(id) {
  return L.map(id, {
    zoomSnap: .25,
    zoomDelta: 1,
    wheelPxPerZoomLevel: 75,
    minZoom: 5,
    maxZoom: 20,
    maxBounds: extent,
    maxBoundsViscosity: .85,
    scrollWheelZoom: true
  });
}

export function buildExplorer(data, onSelect, onRegion) {
  const map = initialize("ghana-map");
  fitGhana(map, 20);
  const layers = drawBase(map, data, true, onRegion);
  const base = basemapControl(map, layers, "main-basemap");
  layers.observations = L.layerGroup().addTo(map);
  const markers = new Map();

  for (const sample of data.examples) {
    const title = document.createElement("strong");
    title.textContent = types[sample.category].label;
    const tag = document.createElement("span");
    tag.className = "popup-type";
    tag.textContent = sample.region + " · Fictional example";
    const detail = document.createElement("p");
    detail.textContent = sample.notes;
    const content = document.createElement("div");
    content.append(tag, title, detail);
    const marker = L.marker([sample.lat, sample.lng], {
      icon: pinIcon(sample.category, types[sample.category].symbol, 24),
      title: types[sample.category].label + " in " + sample.region + " (fictional example)"
    }).bindPopup(content).addTo(layers.observations);
    marker.on("popupopen", () => onSelect(sample.id));
    marker.on("popupclose", () => onSelect(null));
    markers.set(sample.id, marker);
  }

  let overview = true;
  new ResizeObserver(() => {
    map.invalidateSize();
    if (overview) fitGhana(map, 20);
  }).observe(map.getContainer());
  map.on("dragstart zoomstart", () => { overview = false; });

  return {
    view: () => ({ basemap: base.current(), center: map.getCenter(), zoom: map.getZoom(), overview }),
    selectRegion(name) {
      overview = false;
      layers.selectRegion(name);
    },
    reset() {
      map.closePopup();
      fitGhana(map, 20);
      overview = true;
    },
    toggle(name, visible) {
      if (visible) map.addLayer(layers[name]);
      else map.removeLayer(layers[name]);
    },
    filter(ids) {
      map.closePopup();
      layers.observations.clearLayers();
      for (const id of ids) layers.observations.addLayer(markers.get(id));
    },
    show(id) {
      const marker = markers.get(id);
      overview = false;
      map.setView(marker.getLatLng(), Math.max(9, Math.min(14, map.getZoom())), { animate: false });
      marker.openPopup();
    }
  };
}

export function buildPicker(data, onLocation) {
  const map = initialize("report-map");
  fitGhana(map, 10);
  const base = basemapControl(map, drawBase(map, data, false), "report-basemap");
  let pin;
  map.on("click", event => onLocation(event.latlng));
  return {
    show({ basemap, center, zoom, overview }) {
      base.set(basemap);
      map.invalidateSize();
      if (pin) return;
      if (overview) fitGhana(map, 10);
      else map.setView(center, zoom, { animate: false });
    },
    pin(lat, lng) {
      if (pin) pin.setLatLng([lat, lng]);
      else {
        pin = L.marker([lat, lng], {
          draggable: true, title: "Drag to adjust the report location", icon: pinIcon("pin", "+", 25)
        }).addTo(map);
        pin.on("dragend", () => onLocation(pin.getLatLng()));
      }
    },
    clear() {
      if (pin) map.removeLayer(pin);
      pin = undefined;
    }
  };
}
