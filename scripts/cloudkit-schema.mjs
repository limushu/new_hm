import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloudContainer, verifyCloudSchema } from './ios-cloudkit-signing.mjs';

function cktool(args) {
  const result = spawnSync('xcrun', ['cktool', ...args], { encoding: 'utf8', timeout: 120000 });
  if (result.error || result.status !== 0) {
    const token = process.env.CKTOOL_MANAGEMENT_TOKEN;
    const detail = String(result.stderr || result.stdout || result.error?.message || '')
      .split(token || '\0')
      .join('[redacted]')
      .slice(0, 900);
    throw new Error(`CloudKit ${args[0]} failed: ${detail}`);
  }
  return result.stdout;
}
function authorization(team) {
  const token = process.env.CKTOOL_MANAGEMENT_TOKEN;
  if (!token) throw new Error('Add CLOUDKIT_MANAGEMENT_TOKEN in GitHub Secrets first');
  return ['--token', token, '--team-id', team, '--container-id', cloudContainer];
}
export function exportCloudSchema(team, environment, file) {
  const help = cktool(['export-schema', '--help']);
  const args = ['export-schema', ...authorization(team), '--environment', environment];
  if (help.includes('--output-file')) args.push('--output-file', file);
  else if (help.includes('--file')) args.push('--file', file);
  const output = cktool(args);
  if (!help.includes('--output-file') && !help.includes('--file'))
    writeFileSync(file, output, { mode: 0o600 });
  return readFileSync(file, 'utf8');
}
export function deployCloudSchema(team, schemaFile) {
  const temporary = mkdtempSync(join(tmpdir(), 'anjian-cloudkit-schema-'));
  try {
    const existing = exportCloudSchema(team, 'development', join(temporary, 'existing.ckdb'));
    const allowed = new Set(['Users', 'AnjianSyncHead', 'AnjianSyncIndex', 'AnjianSyncChunk']);
    if ([...existing.matchAll(/RECORD TYPE\s+(\w+)/g)].some((match) => !allowed.has(match[1])))
      throw new Error('Container has additional record types; merge its schema before importing');
    for (const environment of ['development', 'production']) {
      cktool([
        'import-schema',
        ...authorization(team),
        '--environment',
        environment,
        '--validate',
        '--file',
        schemaFile,
      ]);
      console.log(`CloudKit ${environment} schema imported`);
    }
    verifyCloudSchema(exportCloudSchema(team, 'production', join(temporary, 'production.ckdb')));
    console.log('CloudKit Production schema verified');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
if (process.argv[1]?.endsWith('/cloudkit-schema.mjs'))
  deployCloudSchema('UN356US9WL', new URL('../cloudkit/schema.ckdb', import.meta.url).pathname);
