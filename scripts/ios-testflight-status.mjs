import { createPrivateKey, sign } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export function appStoreToken({ keyId, issuer, privateKey }, now = Date.now()) {
  const issued = Math.floor(now / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({ iss: issuer, iat: issued, exp: issued + 600, aud: 'appstoreconnect-v1' })}`;
  let signature;
  try {
    signature = sign('sha256', Buffer.from(unsigned), {
      key: createPrivateKey(privateKey),
      dsaEncoding: 'ieee-p1363',
    });
  } catch {
    throw new Error('Cannot sign App Store Connect status request');
  }
  return `${unsigned}.${signature.toString('base64url')}`;
}

/** Read-only inspection. This never assigns a group, invites testers or publishes. */
export async function testFlightStatus(
  credentials,
  { bundleId, version, buildNumber },
  { fetch: request = globalThis.fetch, wait = delay, attempts = 24 } = {},
) {
  const authorization = `Bearer ${appStoreToken(credentials)}`;
  const get = async (path) => {
    let response;
    try {
      response = await request(`https://api.appstoreconnect.apple.com/v1/${path}`, {
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { authorization },
      });
    } catch {
      throw new Error('App Store Connect status request unavailable');
    }
    if (!response.ok)
      throw new Error(`App Store Connect status request failed (HTTP ${response.status})`);
    try {
      return await response.json();
    } catch {
      throw new Error('App Store Connect status response invalid');
    }
  };
  const result = {
    processingState: 'NOT_FOUND',
    internalBuildState: 'UNKNOWN',
    readyForInternalTesting: false,
  };
  try {
    const appQuery = new URLSearchParams({ 'filter[bundleId]': bundleId, limit: '2' });
    const apps = await get(`apps?${appQuery}`);
    if (apps.data?.length !== 1 || typeof apps.data[0].id !== 'string')
      throw new Error('Expected exactly one App Store Connect app');
    const app = apps.data[0].id;
    const query = new URLSearchParams({
      'filter[app]': app,
      'filter[version]': buildNumber,
      include: 'preReleaseVersion',
      limit: '20',
    });
    for (let attempt = 0; attempt < attempts; attempt++) {
      const builds = await get(`builds?${query}`);
      const exact = builds.data?.filter(
        (build) =>
          build.attributes?.version === buildNumber &&
          builds.included?.some(
            (release) =>
              release.type === 'preReleaseVersions' &&
              release.id === build.relationships?.preReleaseVersion?.data?.id &&
              release.attributes?.version === version,
          ),
      );
      if (exact?.length > 1) throw new Error('Ambiguous App Store Connect build');
      const build = exact?.[0];
      if (build) {
        result.buildId = build.id;
        result.processingState = build.attributes.processingState ?? 'UNKNOWN';
        if (['FAILED', 'INVALID'].includes(result.processingState)) return result;
        if (result.processingState === 'VALID') {
          const beta = await get(`builds/${encodeURIComponent(build.id)}/buildBetaDetail`);
          result.internalBuildState = beta.data?.attributes?.internalBuildState ?? 'UNKNOWN';
          result.readyForInternalTesting = result.internalBuildState === 'IN_BETA_TESTING';
          if (result.readyForInternalTesting) return result;
        }
      }
      if (attempt + 1 < attempts) await wait(10000);
    }
    return result;
  } catch (error) {
    // Upload has already succeeded. Preserve that fact if the read API is
    // temporarily unavailable or this key lacks read access. Never echo a body.
    return {
      ...result,
      inspectionError: error instanceof Error ? error.message : 'Status inspection unavailable',
    };
  }
}
