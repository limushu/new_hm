import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// The private key belongs to the release owner, never the repository or bundle.
const env = { ...process.env };
const localKey = join(homedir(), '.hm-release', 'updater.key');
if (!env.TAURI_SIGNING_PRIVATE_KEY && existsSync(localKey)) {
  env.TAURI_SIGNING_PRIVATE_KEY = localKey;
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= '';
}
if (!env.TAURI_SIGNING_PRIVATE_KEY) {
  console.error(
    '发布构建需要 TAURI_SIGNING_PRIVATE_KEY。仅检查编译可用 npx tauri build --no-bundle。',
  );
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  [resolve('node_modules/@tauri-apps/cli/tauri.js'), 'build', ...process.argv.slice(2)],
  {
    env,
    stdio: 'inherit',
    windowsHide: true,
  },
);
process.exit(result.status ?? 1);
