#!/usr/bin/env node
'use strict';

// Fetches the Florida ZCTA GeoJSON into public/ so the territory map
// can render ZIP-code polygons at runtime. The file is ~22 MB
// uncompressed (~6 MB gzipped on the wire, cached by the CDN) so we
// don't check it into git — it's downloaded at `npm install` time on
// dev machines and CI (Vercel).
//
// Idempotent: skips the download if the file already exists.
// Non-blocking: failures print a warning but exit 0 so CI keeps going;
// the frontend will simply render the radius-circle fallback until the
// file is present.

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const URL = 'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/fl_florida_zip_codes_geo.min.json';
const OUT = path.resolve(__dirname, '..', 'public', 'zcta-fl.geojson');

if (fs.existsSync(OUT)) {
  const size = fs.statSync(OUT).size;
  if (size > 1024 * 1024) {
    console.log(`[fetch-zcta] ${OUT} exists (${(size / 1024 / 1024).toFixed(1)} MB), skipping.`);
    process.exit(0);
  }
  // File exists but is suspiciously tiny — probably a failed prior fetch.
  fs.unlinkSync(OUT);
}

console.log(`[fetch-zcta] downloading ${URL} → ${OUT}`);

function download(url, dest, redirects = 3) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirects <= 0) return reject(new Error('Too many redirects'));
          res.resume();
          return resolve(download(res.headers.location, dest, redirects - 1));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', (err) => { fs.unlink(dest, () => reject(err)); });
      })
      .on('error', reject);
  });
}

download(URL, OUT)
  .then(() => {
    const mb = fs.statSync(OUT).size / 1024 / 1024;
    console.log(`[fetch-zcta] done — ${mb.toFixed(1)} MB`);
  })
  .catch((err) => {
    console.warn(`[fetch-zcta] warning — ${err.message}`);
    console.warn('[fetch-zcta] territory maps will fall back to the radius circle until this file is present.');
    process.exit(0);
  });
