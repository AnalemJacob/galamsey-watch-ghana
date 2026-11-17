export const types = {
  land: { label: "Disturbed ground", symbol: "▲" },
  water: { label: "Changes in water", symbol: "≈" },
  vegetation: { label: "Vegetation clearing", symbol: "✳" }
};

export function regionAt(lng, lat, regions) {
  function insideRing(ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x, y] = ring[i];
      const [prevX, prevY] = ring[j];
      if ((y > lat) !== (prevY > lat) && lng < (prevX - x) * (lat - y) / (prevY - y) + x) {
        inside = !inside;
      }
    }
    return inside;
  }

  for (const { geometry, properties } of regions.features) {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    if (polygons.some(([outer, ...holes]) => insideRing(outer) && !holes.some(insideRing))) {
      return properties.shapeName.replace(/ Region$/, "");
    }
  }
  return null;
}

export function validateDraft(draft, regions) {
  if (!draft || typeof draft !== "object" || draft.fictional !== true ||
      typeof draft.id !== "string" || !/^[a-f0-9-]{36}$/i.test(draft.id) ||
      !Object.hasOwn(types, draft.category)) {
    throw new Error("Choose an observation type and save a fictional example.");
  }
  const { id, category, lat, lng, date } = draft;
  const dateObject = new Date(typeof date === "string" ? date : NaN);
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(dateObject.valueOf()) || dateObject.toISOString().slice(0, 10) !== date ||
      date < "1900-01-01" || date > localToday) {
    throw new Error("Choose a valid observation date up to today.");
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Choose a location or enter both coordinates.");
  }
  const region = regionAt(lng, lat, regions);
  if (!region) throw new Error("Choose a location inside the mapped Ghana boundary.");
  const notes = typeof draft.notes === "string" ? draft.notes.trim() : "";
  if (notes.length < 6 || notes.length > 350) throw new Error("Write a description of 6 to 350 characters.");
  return { id, category, date, lat, lng, region, notes, fictional: true };
}
