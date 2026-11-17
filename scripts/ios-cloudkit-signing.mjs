import { appStoreToken } from './ios-testflight-status.mjs';
import { X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const cloudContainer = 'iCloud.com.limushu.hm';
export function cloudEntitlementsValid(value) {
  return (
    value['com.apple.developer.icloud-container-identifiers']?.includes(cloudContainer) &&
    value['com.apple.developer.icloud-services']?.includes('CloudKit') &&
    value['com.apple.developer.icloud-container-environment'] === 'Production'
  );
}
function decodeProfile(content) {
  const directory = mkdtempSync(join(tmpdir(), 'anjian-profile-'));
  try {
    const path = join(directory, 'profile');
    writeFileSync(path, Buffer.from(content, 'base64'), { mode: 0o600 });
    const decoded = spawnSync('security', ['cms', '-D', '-i', path], { encoding: 'utf8' });
    if (decoded.status !== 0) throw new Error('Cannot decode Apple provisioning profile');
    const parsed = spawnSync(
      'python3',
      [
        '-c',
        'import plistlib,sys,json,base64; p=plistlib.loads(sys.stdin.buffer.read()); print(json.dumps({"entitlements":p["Entitlements"],"expires":p["ExpirationDate"].isoformat(),"certificates":[base64.b64encode(c).decode() for c in p["DeveloperCertificates"]]}))',
      ],
      { input: decoded.stdout, encoding: 'utf8' },
    );
    if (parsed.status !== 0) throw new Error('Invalid Apple provisioning profile');
    return JSON.parse(parsed.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
/** Existing distribution certificate/key stays unchanged; create an updated profile only. */
export async function cloudSigning(
  credentials,
  { profile, create = false, fetch: request = globalThis.fetch } = {},
) {
  const authorization = `Bearer ${appStoreToken(credentials)}`;
  async function api(path, body) {
    let response;
    try {
      response = await request(`https://api.appstoreconnect.apple.com/v1/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { authorization, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error('Apple signing API unavailable');
    }
    if (!response.ok) throw new Error(`Apple signing request failed (HTTP ${response.status})`);
    return response.json();
  }
  const bundles = await api(
    `bundleIds?${new URLSearchParams({ 'filter[identifier]': 'com.limushu.hm', limit: '2' })}`,
  );
  if (bundles.data?.length !== 1) throw new Error('Expected one registered Anjian App ID');
  const bundle = bundles.data[0].id;
  const capabilities = await api(`bundleIds/${bundle}/bundleIdCapabilities?limit=200`);
  const capability = capabilities.data?.find((row) => row.attributes?.capabilityType === 'ICLOUD');
  if (!capability)
    throw new Error('Enable iCloud / CloudKit for com.limushu.hm in Apple Developer first');
  const result = { capability: 'ICLOUD', profileReady: false };
  if (!profile) {
    if (create)
      throw new Error(
        'CloudKit signing currently requires the existing manual distribution profile',
      );
    return result;
  }
  const existing = decodeProfile(profile);
  if (
    cloudEntitlementsValid(existing.entitlements) &&
    new Date(existing.expires + 'Z').getTime() > Date.now()
  )
    return { ...result, profileReady: true, profile };
  if (!create) return result;
  const matching = new Set(
    existing.certificates.map(
      (der) => new X509Certificate(Buffer.from(der, 'base64')).fingerprint256,
    ),
  );
  const certificates = await api('certificates?limit=200');
  const selected = certificates.data?.filter((row) => {
    try {
      return (
        ['IOS_DISTRIBUTION', 'DISTRIBUTION'].includes(row.attributes.certificateType) &&
        new Date(row.attributes.expirationDate).getTime() > Date.now() &&
        matching.has(
          new X509Certificate(Buffer.from(row.attributes.certificateContent, 'base64'))
            .fingerprint256,
        )
      );
    } catch {
      return false;
    }
  });
  if (!selected?.length)
    throw new Error('No active distribution certificate matches the existing signing profile');
  const created = await api('profiles', {
    data: {
      type: 'profiles',
      attributes: {
        name: `Anjian CloudKit ${process.env.GITHUB_RUN_ID ?? Date.now()}-${process.env.GITHUB_RUN_ATTEMPT ?? 1}`,
        profileType: 'IOS_APP_STORE',
      },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: bundle } },
        certificates: {
          data: selected.map((certificate) => ({ type: 'certificates', id: certificate.id })),
        },
      },
    },
  });
  const content = created.data?.attributes?.profileContent;
  const updated = content ? decodeProfile(content) : null;
  if (!updated || !cloudEntitlementsValid(updated.entitlements))
    throw new Error(
      'Apple profile does not authorize iCloud.com.limushu.hm / CloudKit Production; check container association',
    );
  return { ...result, profileReady: true, profile: content };
}

export function cloudProjectTemplate(template) {
  const info = '        LSRequiresIPhoneOS: true';
  const entitlements =
    '    entitlements:\n      path: {{app.name}}_iOS/{{app.name}}_iOS.entitlements';
  if (!template.includes(info) || !template.includes(entitlements))
    throw new Error('iOS template is missing CloudKit insertion points');
  return template
    .replace(info, `${info}\n        AnjianCloudKitContainer: ${cloudContainer}`)
    .replace(
      entitlements,
      `${entitlements}\n      properties:\n        com.apple.developer.icloud-container-identifiers: [${cloudContainer}]\n        com.apple.developer.icloud-services: [CloudKit]\n        com.apple.developer.icloud-container-environment: Production`,
    );
}
export function verifyCloudSchema(schema) {
  for (const [type, fields] of Object.entries({
    AnjianSyncHead: { revision: 'STRING' },
    AnjianSyncIndex: { sha: 'STRING', json: 'STRING' },
    AnjianSyncChunk: { sha: 'STRING', data: 'ASSET' },
  })) {
    const record = new RegExp(`RECORD TYPE ${type}\\s*\\(([\\s\\S]*?)\\);`).exec(schema)?.[1];
    if (
      !record ||
      Object.entries(fields).some(
        ([name, type]) => !new RegExp(`\\b${name}\\s+${type}\\b`).test(record),
      )
    )
      throw new Error('CloudKit Production schema is incomplete');
  }
}
