// Prepare a verified mirror bundle locally. This script never uploads files or credentials.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { verifyRelease } from './verify-release.mjs';

const baseText = process.argv[2];
if (!baseText)
  throw new Error('用法：npm run artifacts:mirror -- https://下载域名/不可变版本目录/');
const base = new URL(baseText.endsWith('/') ? baseText : `${baseText}/`);
if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash)
  throw new Error('镜像目录必须是无账号、参数与片段的 HTTPS 地址');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const source = resolve('artifacts/windows', version);
verifyRelease(source);
const manifest = JSON.parse(readFileSync(join(source, 'latest.json'), 'utf8'));
const platform = manifest.platforms['windows-x86_64'];
const asset = basename(new URL(platform.url).pathname);
const output = resolve('artifacts/update-mirror', version);
mkdirSync(output, { recursive: true });
for (const name of [asset, `${asset}.sig`, 'README.zh-CN.md'])
  copyFileSync(join(source, name), join(output, name));
platform.url = new URL(asset, base).href;
writeFileSync(join(output, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
const names = [asset, `${asset}.sig`, 'latest.json', 'README.zh-CN.md'];
writeFileSync(
  join(output, 'SHA256SUMS.txt'),
  names
    .map(
      (name) =>
        `${createHash('sha256')
          .update(readFileSync(join(output, name)))
          .digest('hex')}  ${name}`,
    )
    .join('\n') + '\n',
);
verifyRelease(output);
console.log(
  `镜像包已准备：${output}\n请先上传安装包，再原子替换稳定入口的 latest.json。没有执行网络发布。`,
);
