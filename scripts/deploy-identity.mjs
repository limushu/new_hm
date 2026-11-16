import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { identityMigrationSql } from './identity-migration.mjs';

if (!process.argv.includes('--apply')) {
  console.log(
    'Dry run: would apply account catalog migration and deploy delete-account. No external calls.',
  );
} else {
  const project = process.env.SUPABASE_PROJECT_REF;
  const access = process.env.SUPABASE_ACCESS_TOKEN;
  if (!project || !/^[a-z0-9]{20}$/.test(project) || !access)
    throw new Error('Set SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN before deployment');
  const root = resolve(import.meta.dirname, '..');
  const query = identityMigrationSql(
    readFileSync(resolve(root, 'supabase/migrations/202611160001_account_catalog.sql'), 'utf8'),
  );
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
    headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, read_only: false }),
  });
  if (!response.ok)
    throw new Error(
      `Account migration failed (HTTP ${response.status}); inspect the project schema before retrying. No existing data was reset.`,
    );
  console.log('Account catalog migration applied or already present.');
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      '--yes',
      'supabase@3.1.0',
      'functions',
      'deploy',
      'delete-account',
      '--use-api',
      '--no-verify-jwt',
      `--remote=${project}`,
      '--yes',
    ],
    { cwd: root, stdio: 'inherit', env: process.env },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      'Edge Function deployment failed. Catalog migration remains applied and can be retried.',
    );
  console.log(
    'Hosted identity schema and deletion function deployed. OAuth providers and app/cloud clients still require configuration and real-device testing.',
  );
}
