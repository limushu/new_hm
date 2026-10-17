import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyRelease(directory) {
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  const manifest = JSON.parse(readFileSync(join(directory, 'latest.json'), 'utf8'));
  if (manifest.version !== config.version) throw new Error('更新清单版本不匹配');
  const platform = manifest.platforms['windows-x86_64'];
  const asset = basename(new URL(platform.url).pathname);
  const bytes = readFileSync(join(directory, asset));
  const signatureText = readFileSync(join(directory, `${asset}.sig`), 'utf8').trim();
  if (platform.signature !== signatureText) throw new Error('清单签名与安装包签名不同');
  const publicLines = Buffer.from(config.plugins.updater.pubkey, 'base64')
    .toString('utf8')
    .trim()
    .split(/\r?\n/);
  const lines = Buffer.from(signatureText, 'base64').toString('utf8').trim().split(/\r?\n/);
  const pub = Buffer.from(publicLines[1], 'base64');
  const packet = Buffer.from(lines[1], 'base64');
  if (
    pub.length !== 42 ||
    packet.length !== 74 ||
    packet.subarray(0, 2).toString() !== 'ED' ||
    !pub.subarray(2, 10).equals(packet.subarray(2, 10))
  )
    throw new Error('升级签名格式或密钥不匹配');
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub.subarray(10)]),
    format: 'der',
    type: 'spki',
  });
  const valid = (data) =>
    verify(null, createHash('blake2b512').update(data).digest(), key, packet.subarray(10));
  if (!valid(bytes)) throw new Error('安装包签名验证失败');
  if (!lines[2].startsWith('trusted comment: ')) throw new Error('缺少受签名保护的版本说明');
  const comment = lines[2].slice('trusted comment: '.length);
  if (
    !verify(
      null,
      Buffer.concat([packet.subarray(10), Buffer.from(comment)]),
      key,
      Buffer.from(lines[3], 'base64'),
    )
  )
    throw new Error('版本说明签名验证失败');
  if (!comment.split('\t').includes(`version:${manifest.version}`))
    throw new Error('受签名保护的版本不匹配');
  const altered = Buffer.from(bytes);
  altered[altered.length - 1] ^= 1;
  if (valid(altered)) throw new Error('篡改安装包未被拒绝');
  console.log(`升级包签名、受保护版本与篡改拒绝检查通过：${asset}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  verifyRelease(resolve(process.argv[2] ?? `artifacts/windows/${version}`));
}
