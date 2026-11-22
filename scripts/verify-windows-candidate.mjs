import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { verifyRelease } from './verify-release.mjs';

// A native-test repair can reuse a signed build only when all product sources
// are unchanged. Runtime fixes must produce a new candidate.
const candidate = JSON.parse(readFileSync('artifacts/windows-candidate.json', 'utf8'));
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(candidate.version, version);
assert.match(candidate.source, /^[a-f0-9]{40}$/);
execFileSync(
  'git',
  [
    'diff',
    '--exit-code',
    candidate.source,
    'HEAD',
    '--',
    'src',
    'src-tauri',
    'crates',
    'Cargo.toml',
    'Cargo.lock',
    'package.json',
    'package-lock.json',
    'public',
    'index.html',
    'vite.config.ts',
    'tsconfig*.json',
    'supabase/client.public.json',
    'scripts/copy-pdf-assets.mjs',
  ],
  { stdio: 'inherit', windowsHide: true },
);
assert.equal(
  createHash('sha256').update(readFileSync('target/release/hm-app.exe')).digest('hex'),
  candidate.binarySha256,
);
verifyRelease(`artifacts/windows/${version}`);
mkdirSync('artifacts/windows-verification', { recursive: true });
writeFileSync(
  'artifacts/windows-verification/candidate-provenance.json',
  JSON.stringify({ ...candidate, unchangedProductSources: true }, null, 2) + '\n',
);
console.log(`Verified candidate ${candidate.source}; product sources and binary checksum match.`);
