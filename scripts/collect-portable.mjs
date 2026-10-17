import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

if (process.platform !== 'win32') throw new Error('当前绿色包仅用于 Windows x64。');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const binary = resolve('target/release/hm-app.exe');
if (!existsSync(binary)) throw new Error('请先运行 npm run desktop:build');
const local = resolve('.local');
const output = resolve('artifacts/windows');
mkdirSync(local, { recursive: true });
mkdirSync(output, { recursive: true });
const staging = mkdtempSync(join(local, 'portable-package-'));
const name = `律师工作台-${version}-portable`;
const folder = join(staging, name);
mkdirSync(folder);
copyFileSync(binary, join(folder, '律师工作台.exe'));
writeFileSync(
  join(folder, '.portable'),
  'Keep this marker beside the executable to store data in ./data.\n',
);
copyFileSync('docs/portable-release.md', join(folder, '使用说明.md'));
// Package only freshly staged public files. Never archive a previously used portable data folder.
const temporaryZip = join(staging, `${name}.zip`);
const result = spawnSync(
  'pwsh',
  [
    '-NoProfile',
    '-NonInteractive',
    '-File',
    resolve('scripts/package-portable.ps1'),
    '-SourceFolder',
    folder,
    '-ZipPath',
    temporaryZip,
    '-ExpectedVersion',
    version,
  ],
  { stdio: 'inherit', windowsHide: true },
);
if (result.status !== 0) throw new Error(`压缩失败：${result.error?.message ?? result.status}`);
const destination = join(output, `${name}.zip`);
copyFileSync(temporaryZip, destination);
const hash = createHash('sha256').update(readFileSync(destination)).digest('hex');
writeFileSync(`${destination}.sha256`, `${hash}  ${name}.zip\n`);
const checked = relative(local, staging);
if (!checked.startsWith('..') && !checked.includes('\\') && checked.startsWith('portable-package-'))
  rmSync(staging, { recursive: true });
console.log(`${destination}\nSHA-256: ${hash}`);
