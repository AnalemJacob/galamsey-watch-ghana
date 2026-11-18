import { fitGhana } from "./maps.js";

const L = window.L;
if (L) setupVolunteerMap();

function setupVolunteerMap() {
  const el = id => document.getElementById("volunteer-" + id);
  const map = L.map(el("map"), { maxZoom: 20, doubleClickZoom: false });
  fitGhana(map);
  L.control.scale({ imperial: false }).addTo(map);
  const layers = {
    sentinel: {
      label: "Sentinel-2 · 2024 overview",
      url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg",
      attribution: '<a href="https://cloudless.eox.at/">EOX</a> · Modified Copernicus Sentinel data 2024',
      zoom: 14,
      note: "Sentinel-2 overview. Zooming past the source detail enlarges pixels. Draw only where the boundary is visible."
    }
  };
  let tiles;
  let imagery;
  let vertices = [];
  let drawing = false;
  let complete = false;
  let session;
  let user;
  let saving = false;
  const outlines = L.layerGroup().addTo(map);

  function selectImagery(key) {
    const source = layers[key];
    if (tiles) tiles.remove();
    imagery = key;
    tiles = L.tileLayer(source.url, { attribution: source.attribution, maxNativeZoom: source.zoom, maxZoom: 20 });
    tiles.on("tileerror", () => {
      if (imagery === key) el("imagery-note").textContent = "Some imagery tiles did not load. Try another layer or check your connection.";
    });
    tiles.addTo(map);
    el("imagery-note").textContent = source.note;
  }

  function addChoice(key) {
    el("imagery").add(new Option(layers[key].label, key));
  }

  function update() {
    outlines.clearLayers();
    const style = { color: "#ffe45d", fillColor: "#ffb647", fillOpacity: 0.25, weight: 3, interactive: false };
    if (complete) L.polygon(vertices, style).addTo(outlines);
    else if (vertices.length > 1) L.polyline(vertices, style).addTo(outlines);
    if (drawing) for (const vertex of vertices) L.circleMarker(vertex, { ...style, radius: 4 }).addTo(outlines);
    el("map").classList.toggle("is-drawing", drawing);
    el("start").disabled = drawing || complete || saving;
    el("undo").disabled = !drawing || !vertices.length;
    el("finish").disabled = !drawing || vertices.length < 3;
    el("clear").disabled = (!drawing && !complete) || saving;
    el("download").disabled = !complete;
    el("submit").disabled = !complete || !user || saving;
    el("community").disabled = saving;
  }

  function feature(community) {
    const ring = vertices.map(({lng, lat}) => [lng, lat]);
    return { type: "Feature", geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
      properties: { community, observation: "possible mining-related disturbance", imagery } };
  }

  addChoice("sentinel");
  selectImagery("sentinel");
  update();
  el("imagery").onchange = event => {
    if (drawing || complete) {
      event.target.value = imagery;
      el("status").textContent = "Clear the outline before switching imagery. Download it first if you want to keep a copy.";
      return;
    }
    selectImagery(event.target.value);
  };
  el("reset").onclick = () => fitGhana(map);
  el("start").onclick = () => {
    drawing = true;
    el("status").textContent = "Click each corner in order. Choose Finish outline when you have traced the boundary.";
    update();
  };
  map.on("click", ({latlng}) => {
    if (!drawing) return;
    if (map.getZoom() < 14) {
      el("status").textContent = "Zoom in farther before tracing the outline.";
      return;
    }
    if (vertices.length >= 200) {
      el("status").textContent = "This outline has reached 200 corners. Finish it or undo a point.";
      return;
    }
    if (!vertices.some(vertex => vertex.equals(latlng))) vertices.push(latlng);
    update();
  });
  el("undo").onclick = () => { vertices.pop(); update(); };
  el("finish").onclick = () => {
    const points = vertices.map(({lng, lat}) => [lng, lat]);
    if (!validRing(points)) {
      el("status").textContent = "The boundary overlaps itself or has no area. Undo points and trace around the outside edge.";
      return;
    }
    drawing = false;
    complete = true;
    el("status").textContent = "Outline ready. Enter the community name, then submit for review or download.";
    update();
  };
  el("clear").onclick = () => {
    vertices = [];
    drawing = complete = false;
    el("status").textContent = "Outline cleared.";
    update();
  };
  el("download").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(feature(el("community").value.trim()))],
      { type: "application/geo+json" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "galamsey-candidate.geojson" });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  el("submit").onclick = async () => {
    if (!user || !complete || saving) return;
    const community = el("community").value.trim();
    if (!community) {
      el("status").textContent = "Enter a nearby community name before submitting.";
      el("community").focus();
      return;
    }
    saving = true;
    update();
    try {
      const ref = await session.save(community, imagery, JSON.stringify(feature(community).geometry));
      vertices = [];
      complete = false;
      el("community").value = "";
      el("status").textContent = "Submitted for review. Reference: " + ref.id;
    } catch {
      el("status").textContent = "Submission could not be saved. Your outline is still here. Retry or download it.";
    } finally {
      saving = false;
      update();
    }
  };

  loadConfiguration().then(async config => {
    if (config.enableNoncommercialMapboxTracing === true && /^pk\.[\w.-]+$/.test(config.mapboxPublicToken)) {
      layers.mapbox = {
        label: "Mapbox Satellite · higher-resolution imagery",
        url: "https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.jpg?access_token=" + encodeURIComponent(config.mapboxPublicToken),
        attribution: '<a href="https://www.mapbox.com/about/maps/">© Mapbox and imagery providers</a>',
        zoom: 19,
        note: "Imagery resolution and capture dates vary by location. Use this layer for non-commercial tracing."
      };
      addChoice("mapbox");
      if (!drawing && !complete) {
        el("imagery").value = "mapbox";
        selectImagery("mapbox");
      }
    } else if (imagery === "sentinel") {
      el("imagery-note").textContent += " Higher-resolution Mapbox imagery is awaiting activation.";
    }
    if (!config.firebase) {
      el("account").textContent = "Google sign-in is awaiting setup. You can still draw and download an outline.";
      return;
    }
    session = await connectFirebase(config.firebase, nextUser => {
      user = nextUser;
      el("account").textContent = user ? "Signed in. Your submission goes to a private review queue." : "Sign in to submit a candidate for review.";
      el("sign-in").hidden = Boolean(user);
      el("sign-in").disabled = false;
      el("sign-out").hidden = !user;
      update();
    });
    el("sign-in").onclick = async () => {
      el("sign-in").disabled = true;
      try { await session.signIn(); }
      catch { el("account").textContent = "Google sign-in did not complete. Check your connection and try again."; }
      finally { el("sign-in").disabled = false; }
    };
    el("sign-out").onclick = async () => {
      try { await session.signOut(); }
      catch { el("account").textContent = "Sign-out did not complete. Please try again."; }
    };
  }).catch(() => {
    el("account").textContent = "Google sign-in is unavailable. You can still draw and download an outline.";
  });

  new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(el("map"));
}

export function validRing(points) {
  if (points.length < 3) return false;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const n = points.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    area += cross(points[0], a, b);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = points[j];
      const d = points[(j + 1) % n];
      const overlap = [0, 1].every(k => Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k])) <=
        Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k])));
      if (overlap && cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0) return false;
    }
  }
  return Math.abs(area) > 1e-13;
}

async function loadConfiguration() {
  const response = await fetch(new URL("./volunteer-config.json", import.meta.url), { cache: "no-store" });
  return response.ok ? response.json() : {};
}

async function connectFirebase(config, onUser) {
  const base = "https://www.gstatic.com/firebasejs/12.6.0";
  const [core, authSdk, dbSdk] = await Promise.all([
    import(base + "/firebase-app.js"), import(base + "/firebase-auth.js"), import(base + "/firebase-firestore.js")
  ]);
  const app = core.initializeApp(config, "volunteer");
  const auth = authSdk.getAuth(app);
  const db = dbSdk.getFirestore(app);
  authSdk.onAuthStateChanged(auth, onUser);
  return {
    signIn: () => authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider()),
    signOut: () => authSdk.signOut(auth),
    save(community, imagery, geometry) {
      return dbSdk.addDoc(dbSdk.collection(db, "volunteerSubmissions"), {
        owner: auth.currentUser.uid, community, imagery, geometry,
        status: "pending", createdAt: dbSdk.serverTimestamp()
      });
    }
  };
}
