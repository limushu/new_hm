import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const flavor = process.argv[2] === 'release' ? 'release' : 'debug';
const label = flavor === 'release' ? 'release-preview' : 'preview';
const base = resolve('target', flavor);
const out = resolve('artifacts/windows');
mkdirSync(out, { recursive: true });
const binary = join(base, 'hm-app.exe');
if (!existsSync(binary)) throw new Error(`未找到程序：${binary}`);
const paths = [[binary, join(out, `律师工作台-0.1.0-${label}.exe`)]];
const bundleDir = join(base, 'bundle/nsis');
if (existsSync(bundleDir)) {
  const installer = readdirSync(bundleDir).find((n) => n.endsWith('-setup.exe'));
  if (installer)
    paths.push([join(bundleDir, installer), join(out, `律师工作台-0.1.0-${label}-setup.exe`)]);
}
for (const [source, destination] of paths) {
  copyFileSync(source, destination);
  console.log(`${destination} (${(statSync(destination).size / 1048576).toFixed(2)} MiB)`);
}
copyFileSync(resolve('docs/preview-release.md'), join(out, '试用说明.md'));
const checksums = [];
for (const name of readdirSync(out).filter((n) => n.endsWith('.exe'))) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(out, name))) hash.update(chunk);
  checksums.push(`${hash.digest('hex')}  ${name}`);
}
writeFileSync(join(out, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
