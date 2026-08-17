// ZIP-code polygon loader for territory maps.
//
// Fetches the Florida ZCTA GeoJSON once (public/zcta-fl.geojson, ~22MB
// uncompressed, ~6MB gzipped over the wire) and caches the parsed
// FeatureCollection on the module. Downstream callers ask for a
// filtered subset by ZIP list. When we add more states we'll swap the
// single-file fetch for a per-state lookup, but the public API of this
// module stays stable.
//
// The Census property that holds the 5-digit ZIP on the FL file is
// `ZCTA5CE10`. If you ever regenerate the file from a newer TIGER
// release, verify this key.

const ZCTA_URL = '/zcta-fl.geojson';
const ZIP_PROP = 'ZCTA5CE10';

let cache = null;
let inflight = null;

async function loadAll() {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch(ZCTA_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`ZCTA fetch failed: ${r.status}`);
      return r.json();
    })
    .then((fc) => {
      // Index by ZIP once so filtering N territories doesn't re-scan
      // the full ~983-feature collection each time.
      const byZip = new Map();
      for (const f of fc.features || []) {
        const z = f.properties && f.properties[ZIP_PROP];
        if (z) byZip.set(String(z), f);
      }
      cache = { fc, byZip };
      inflight = null;
      return cache;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

// Return a FeatureCollection containing ONLY the requested ZIPs. Unknown
// ZIPs are silently dropped — the caller has already validated shape
// (5 digits) at input time.
export async function getZipBoundaries(zipCodes) {
  if (!Array.isArray(zipCodes) || zipCodes.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }
  const { byZip } = await loadAll();
  const features = [];
  for (const raw of zipCodes) {
    const z = String(raw || '').trim();
    const f = byZip.get(z);
    if (f) features.push(f);
  }
  return { type: 'FeatureCollection', features };
}

// Warm the cache — call this from a low-priority spot if you want the
// first territory-map render to be instant instead of paying the ~6MB
// fetch on the first modal open.
export function prewarmZipBoundaries() {
  loadAll().catch(() => { /* swallow — will retry on demand */ });
}
