// Local test signing only. Private identity stays outside Git and CI artifacts.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [candidate, tool, output] = process.argv.slice(2);
if (!candidate || !tool || !output)
  throw new Error('Usage: node scripts/sign-android.mjs unsigned.apk apksigner.jar signed.apk');
if (resolve(candidate) === resolve(output)) throw new Error('Preserve the unsigned candidate');
const directory = resolve('.local/android-signing');
const key = resolve(directory, 'anjian-test.p12');
const password = resolve(directory, 'password');
const pin = 'scripts/android-test-signing.json';
const alias = 'anjian-test';
const keytool = (args) => execFileSync('keytool', args, { stdio: ['ignore', 'pipe', 'pipe'] });
if (!existsSync(key) || !existsSync(password)) {
  if (existsSync(pin) || existsSync(key) || existsSync(password))
    throw new Error(
      'Restore the original Android signing key and password; never rotate an update identity implicitly',
    );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(password, randomBytes(48).toString('base64url'), { mode: 0o600, flag: 'wx' });
  keytool([
    '-genkeypair',
    '-alias',
    alias,
    '-keyalg',
    'RSA',
    '-keysize',
    '3072',
    '-sigalg',
    'SHA256withRSA',
    '-validity',
    '10000',
    '-dname',
    'CN=Anjian Android Test,O=Anjian',
    '-storetype',
    'PKCS12',
    '-keystore',
    key,
    '-storepass:file',
    password,
    '-keypass:file',
    password,
    '-noprompt',
  ]);
}
chmodSync(directory, 0o700);
chmodSync(key, 0o600);
chmodSync(password, 0o600);
const certificate = keytool([
  '-exportcert',
  '-alias',
  alias,
  '-keystore',
  key,
  '-storepass:file',
  password,
]);
const certificateSha256 = createHash('sha256').update(certificate).digest('hex');
if (existsSync(pin)) {
  if (JSON.parse(readFileSync(pin, 'utf8')).certificateSha256 !== certificateSha256)
    throw new Error('Android signer differs from the published test update identity');
} else {
  writeFileSync(
    pin,
    JSON.stringify(
      { alias, certificateSha256, purpose: 'Android direct-install test releases' },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
}
mkdirSync(dirname(resolve(output)), { recursive: true });
execFileSync(
  'java',
  [
    '-jar',
    tool,
    'sign',
    '--ks',
    key,
    '--ks-key-alias',
    alias,
    '--ks-pass',
    `file:${password}`,
    '--min-sdk-version',
    '24',
    '--v1-signing-enabled',
    'true',
    '--v2-signing-enabled',
    'true',
    '--v3-signing-enabled',
    'true',
    '--v4-signing-enabled',
    'false',
    '--out',
    output,
    candidate,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
const verification = execFileSync(
  'java',
  ['-jar', tool, 'verify', '--verbose', '--print-certs', output],
  { encoding: 'utf8' },
);
if (!verification.toLowerCase().includes(certificateSha256))
  throw new Error('Signed APK certificate verification failed');
console.log(verification);
console.log(
  JSON.stringify(
    {
      output,
      certificateSha256,
      apkSha256: createHash('sha256').update(readFileSync(output)).digest('hex'),
    },
    null,
    2,
  ),
);
