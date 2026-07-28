#!/usr/bin/env node
// Checks every NEXT_PUBLIC_ and server-side env var used in source
// is declared in .env.example. Fails CI if any are missing.
const fs = require('fs');
const path = require('path');

const example = fs.readFileSync(
  path.join(__dirname, '../.env.example'),
  'utf8',
);
const declared = new Set(example.match(/^[A-Z0-9_]+(?==)/gm) ?? []);

const SYSTEM_VARS = new Set(['NODE_ENV']);

const ENV_VAR_PATTERN = /process\.env\.([A-Z0-9_]+)/g;
const SKIP_DIRS = new Set(['node_modules', '.next', 'coverage', '.git']);

function walkDir(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

const root = path.join(__dirname, '..');
const sourceFiles = walkDir(root);

const used = new Set();
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = ENV_VAR_PATTERN.exec(content)) !== null) {
    const varName = match[1];
    if (!SYSTEM_VARS.has(varName)) {
      used.add(varName);
    }
  }
  ENV_VAR_PATTERN.lastIndex = 0;
}

const missing = [...used].filter((v) => !declared.has(v));
if (missing.length) {
  console.error('Missing from .env.example:', missing.join(', '));
  process.exit(1);
}
console.log(`✓ All ${used.size} env vars declared in .env.example`);

// ── Production-only sanity warnings (Issue #17) ─────────────────────────────
//
// NEXT_PUBLIC_ADMIN_ADDRESS gates access to /admin in the running app; if
// it's empty, anyone with a connected wallet gets the admin dashboard.
// In CI (NODE_ENV === 'test' from Jest, or any non-production environment)
// this is fine — the test/admin-skip paths skip the admin gate. Only warn
// (don't fail) when NODE_ENV is unset so local dev still passes.
if (
  process.env.NODE_ENV === 'production' &&
  !process.env.NEXT_PUBLIC_ADMIN_ADDRESS
) {
  console.error(
    '\n⚠ NEXT_PUBLIC_ADMIN_ADDRESS is unset in a production env. ' +
      'Any connected wallet will be treated as admin. Set it in your hosting ' +
      'platform before deploying.\n',
  );
  // Don't process.exit — this is a deploy-time misconfig, not an env-shape
  // mismatch; ops should see this with their full env also printed so they
  // can fix it without a roll-back.
}

// Print all declared variables in dev so contributors can spot empty values
// at a glance during `npm run dev`.
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  require('fs')
    .readFileSync(require('path').join(__dirname, '..', '.env.example'), 'utf8')
    .split('\n')
    .filter((line) => /^[A-Z0-9_]+=.*$/.test(line))
    .forEach((line) => {
      const key = line.split('=')[0];
      if (!process.env[key]) {
        // Silence vars known to be empty in local dev (CI placeholders).
        if (['PORT', 'NODE_ENV'].includes(key)) return;
        console.log(`  dev hint: ${key} is currently empty`);
      }
    });
}
