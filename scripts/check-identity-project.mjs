import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectIdentityConfig } from './identity-config.mjs';

const root = resolve(import.meta.dirname, '..');
const config = projectIdentityConfig(
  JSON.parse(readFileSync(resolve(root, 'supabase/client.public.json'), 'utf8')),
);
const status = {
  projectRef: config.projectRef,
  origin: config.origin,
  publicConnection: false,
  providers: { apple: false, google: false, azure: false },
  workspaceSchema: 'unknown',
  managementAccess: 'missing',
  realLoginVerified: false,
  cloudSyncAvailable: false,
};
const settings = await fetch(`${config.origin}/auth/v1/settings`, {
  redirect: 'error',
  signal: AbortSignal.timeout(15000),
  headers: { apikey: config.publicKey },
});
if (!settings.ok) throw new Error(`Public identity connection failed (HTTP ${settings.status})`);
const auth = await settings.json();
status.publicConnection = true;
for (const provider of Object.keys(status.providers))
  status.providers[provider] = auth.external?.[provider] === true;

const schema = await fetch(`${config.origin}/rest/v1/workspaces?select=id&limit=1`, {
  redirect: 'error',
  signal: AbortSignal.timeout(15000),
  headers: { apikey: config.publicKey },
});
if (schema.status === 404) status.workspaceSchema = 'missing';
else if ([401, 403].includes(schema.status)) status.workspaceSchema = 'anonymous-access-denied';
else if (schema.ok) {
  const rows = await schema.json();
  if (!Array.isArray(rows) || rows.length > 0)
    throw new Error('Workspace endpoint exposes anonymous rows; review RLS before continuing');
  status.workspaceSchema = 'no-anonymous-rows';
} else status.workspaceSchema = `http-${schema.status}`;

// The token stays inside the workflow environment. Only readiness is written or printed.
if (process.env.SUPABASE_ACCESS_TOKEN) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${config.projectRef}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
  });
  if (response.ok) {
    const project = await response.json();
    status.managementAccess = project.id === config.projectRef ? 'ready' : 'project-mismatch';
  } else status.managementAccess = `rejected-${response.status}`;
}
const directory = resolve(root, 'artifacts/identity');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'project-readiness.json'), JSON.stringify(status, null, 2) + '\n');
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `Identity project: ${status.projectRef}\n\nPublic connection: ${status.publicConnection}\n\nManagement access: ${status.managementAccess}\n\nOAuth providers enabled: ${
      Object.entries(status.providers)
        .filter(([, enabled]) => enabled)
        .map(([provider]) => provider)
        .join(', ') || 'none'
    }\n\nWorkspace schema: ${status.workspaceSchema}\n`,
  );
console.log(JSON.stringify(status));
