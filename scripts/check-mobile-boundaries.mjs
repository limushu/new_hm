import { spawnSync } from 'node:child_process';

const desktopOnly = new Set([
  'tauri-plugin-autostart',
  'tauri-plugin-single-instance',
  'tauri-plugin-updater',
  'tray-icon',
  'muda',
  'rfd',
]);

for (const target of ['aarch64-linux-android', 'aarch64-apple-ios']) {
  const result = spawnSync(
    'cargo',
    ['tree', '--locked', '-p', 'hm-app', '--target', target, '-e', 'normal', '--prefix', 'none'],
    { encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `Cannot inspect ${target}`);
  const leaked = [...result.stdout.matchAll(/^([\w-]+) v/gm)]
    .map((match) => match[1])
    .filter((name) => desktopOnly.has(name));
  if (leaked.length)
    throw new Error(`${target}: desktop dependencies leaked: ${[...new Set(leaked)].join(', ')}`);
  console.log(`${target}: desktop dependency boundary OK`);
}
