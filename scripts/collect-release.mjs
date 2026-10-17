import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { verifyRelease } from './verify-release.mjs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
if (version !== tauri.version) throw new Error('应用版本不一致');
const source = resolve('target/release/bundle/nsis');
const installer = readdirSync(source).find((name) => name.endsWith(`_${version}_x64-setup.exe`));
if (!installer || !existsSync(join(source, `${installer}.sig`)))
  throw new Error('缺少安装包或升级签名');
const out = resolve('artifacts/windows', version);
mkdirSync(out, { recursive: true });
const assetName = `hm-workspace_${version}_windows-x64-setup.exe`;
copyFileSync(join(source, installer), join(out, assetName));
copyFileSync(join(source, `${installer}.sig`), join(out, `${assetName}.sig`));
const signature = readFileSync(join(out, `${assetName}.sig`), 'utf8').trim();
const base = `https://github.com/limushu/new_hm/releases/download/v${version}`;
writeFileSync(
  join(out, 'latest.json'),
  JSON.stringify(
    {
      version,
      notes:
        '律师工作台 v1.0：案件与阶段、材料与录音、联系人与关系图、收支、日程提醒、备份恢复。安装前会备份当前工作区。',
      pub_date: new Date().toISOString(),
      platforms: { 'windows-x86_64': { signature, url: `${base}/${assetName}` } },
    },
    null,
    2,
  ) + '\n',
);
copyFileSync('docs/v1.0-acceptance.md', join(out, 'README.zh-CN.md'));
const hashes = [];
for (const name of [assetName, `${assetName}.sig`, 'latest.json', 'README.zh-CN.md']) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(out, name))) hash.update(chunk);
  hashes.push(`${hash.digest('hex')}  ${name}`);
}
writeFileSync(join(out, 'SHA256SUMS.txt'), hashes.join('\n') + '\n');
verifyRelease(out);
console.log(`安装包与签名更新清单已整理：${out}`);
