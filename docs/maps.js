import { types } from "./model.js";

const L = window.L;
const bounds = [[4.69, -3.28], [11.18, 1.22]];
const extent = [[0.8, -12], [17.2, 8]];
const colors = ["#cbd9b2", "#d8dfba", "#c0d3a9", "#dbe3c2", "#c8d8b7"];
const attribution = '<a href="./data/SOURCES.txt">Map sources</a> · geoBoundaries · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · Natural Earth';

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

function drawBase(map, data, showLabel) {
  L.control.scale({ imperial: false, maxWidth: 85 }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution(attribution);
  L.geoJSON(data.neighbors, {
    interactive: false, style: { color: "#a3aba0", weight: 1, fillColor: "#e9e7d4", fillOpacity: 1 }
  }).addTo(map);

  const regions = L.layerGroup([
    L.geoJSON(data.regions, {
      style: feature => ({
        color: "#708c73", weight: 1.1,
        fillColor: colors[feature.properties.shapeName.length % colors.length], fillOpacity: 1
      }),
      interactive: false
    })
  ]).addTo(map);
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
  if (showLabel) {
    const placeLabels = L.layerGroup().addTo(map);
    const waterLabels = L.layerGroup().addTo(water);
    const regionLabels = L.layerGroup().addTo(regions);
    function updateLabels() {
      placeLabels.clearLayers();
      waterLabels.clearLayers();
      regionLabels.clearLayers();
      const zoom = map.getZoom();
      for (const [lat, lng, text, kind, minZoom] of data.labels) {
        if (zoom < minZoom) continue;
        const layer = { water: waterLabels, region: regionLabels }[kind] ?? placeLabels;
        labelMarker([lat, lng], text, kind).addTo(layer);
      }
    }
    map.on("zoomend", updateLabels);
    updateLabels();
  }
  return { regions, water };
}

function initialize(id, wheel) {
  return L.map(id, {
    zoomSnap: .25,
    zoomDelta: .5,
    minZoom: 5,
    maxZoom: 11,
    maxBounds: extent,
    maxBoundsViscosity: .85,
    scrollWheelZoom: wheel
  });
}

export function buildExplorer(data, onSelect) {
  const map = initialize("ghana-map", false);
  fitGhana(map, 20);
  const layers = drawBase(map, data, true);
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
      map.setView(marker.getLatLng(), Math.max(7.5, map.getZoom()), { animate: false });
      marker.openPopup();
    }
  };
}

export function buildPicker(data, onLocation) {
  const map = initialize("report-map", false);
  fitGhana(map, 10);
  drawBase(map, data, false);
  let pin;
  map.on("click", event => onLocation(event.latlng));
  return {
    show() {
      map.invalidateSize();
      if (!pin) fitGhana(map, 10);
    },
    pin(lat, lng) {
      if (pin) pin.setLatLng([lat, lng]);
      else pin = L.marker([lat, lng], { icon: pinIcon("pin", "+", 21) }).addTo(map);
    },
    clear() {
      if (pin) map.removeLayer(pin);
      pin = undefined;
    }
  };
}
