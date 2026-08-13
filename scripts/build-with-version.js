#!/usr/bin/env node
'use strict';

// Wrapper around `react-scripts build` that:
//   1. Computes a stable build-version string (prefers Vercel's
//      VERCEL_GIT_COMMIT_SHA, falls back to `git rev-parse --short HEAD`,
//      then to a timestamp for detached CI sandboxes).
//   2. Exposes it to the bundle as `process.env.REACT_APP_BUILD_VERSION`
//      so `useBuildVersion` can compare against `/version.json`.
//   3. Runs CRA build with CI=false (matching the prior npm script).
//   4. Writes `build/version.json` after the bundle emits — the running
//      app polls that file to detect a fresh deploy.
//
// Matches the pattern used by LeadBridge and HireFunnel — see
// Leadbridge/frontend/vite.config.ts and HireFunnel/src/app/dashboard/_components/useBuildVersion.ts.

const { execSync, spawnSync } = require('node:child_process');
const { writeFileSync, mkdirSync, existsSync } = require('node:fs');
const path = require('node:path');

function computeBuildVersion() {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (typeof vercelSha === 'string' && vercelSha.length > 0) {
    return vercelSha.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return `t${Date.now().toString(36)}`;
  }
}

const version = computeBuildVersion();
console.log(`[build-with-version] BUILD_VERSION=${version}`);

const buildEnv = {
  ...process.env,
  CI: 'false',
  REACT_APP_BUILD_VERSION: version,
};

// Delegate to react-scripts — must be spawned so the child inherits the
// patched env. Using shell:true so this works on Windows too where the
// react-scripts binary is a .cmd shim.
const result = spawnSync('react-scripts', ['build'], {
  stdio: 'inherit',
  env: buildEnv,
  shell: true,
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const outDir = path.resolve(__dirname, '..', 'build');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const payload = JSON.stringify({
  version,
  builtAt: new Date().toISOString(),
});
writeFileSync(path.join(outDir, 'version.json'), payload);
console.log(`[build-with-version] wrote ${outDir}/version.json (${payload})`);
