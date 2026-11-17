import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deflateRawSync, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { syncIosIcons } from './ios-icons.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'hm-ios-icons-'));
  const catalog = join(root, 'src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset');
  const source = join(root, 'src-tauri/icons/ios');
  mkdirSync(catalog, { recursive: true });
  mkdirSync(source, { recursive: true });
  return { root, catalog, source };
}
describe('iOS branding delivery', () => {
  it('replaces template slots including the store icon from the committed HM sources', () => {
    const { root, catalog, source } = fixture();
    try {
      const images = [
        { size: '60x60', scale: '2x', filename: 'AppIcon-60x60@2x.png' },
        { size: '1024x1024', scale: '1x', filename: 'AppIcon-512@2x.png' },
      ];
      writeFileSync(join(catalog, 'Contents.json'), JSON.stringify({ images }));
      for (const { filename } of images) {
        writeFileSync(
          join(source, filename),
          readFileSync(resolve('src-tauri/icons/ios', filename)),
        );
        writeFileSync(join(catalog, filename), 'template');
      }
      expect(syncIosIcons(root)).toBe(2);
      for (const { filename } of images) {
        const bytes = readFileSync(join(catalog, filename));
        expect(bytes[bytes.indexOf(Buffer.from('IHDR')) + 13]).toBe(2);
      }
      const checked = spawnSync(
        'python3',
        [resolve('scripts/verify-ios-icons.py'), catalog, source, join(root, 'verified.png')],
        { encoding: 'utf8' },
      );
      expect(checked.status, checked.stderr).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 20000);
  it('stops before building if a referenced slot has no product artwork', () => {
    const { root, catalog } = fixture();
    try {
      writeFileSync(
        join(catalog, 'Contents.json'),
        JSON.stringify({ images: [{ size: '60x60', scale: '2x', filename: 'missing.png' }] }),
      );
      expect(() => syncIosIcons(root)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('checks decoded compiled CgBI pixels and rejects a different image', () => {
    const { root, source } = fixture();
    const app = join(root, 'app');
    mkdirSync(app);
    // CRC is intentionally unused by the pixel decoder; IDAT uses Apple's raw
    // deflate/BGRA encoding while the source is ordinary RGB PNG.
    const chunk = (name, bytes) => {
      const header = Buffer.alloc(8);
      header.writeUInt32BE(bytes.length);
      header.write(name, 4);
      return Buffer.concat([header, bytes, Buffer.alloc(4)]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(2);
    header.writeUInt32BE(1, 4);
    header[8] = 8;
    header[9] = 6;
    const png = (cgbi, pixels) =>
      Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        ...(cgbi ? [chunk('CgBI', Buffer.alloc(4))] : []),
        chunk('IHDR', header),
        chunk('IDAT', (cgbi ? deflateRawSync : deflateSync)(Buffer.from([0, ...pixels]))),
        chunk('IEND', Buffer.alloc(0)),
      ]);
    const actual = join(app, 'AppIcon.png');
    try {
      writeFileSync(join(source, 'source.png'), png(false, [10, 20, 30, 255, 40, 50, 60, 255]));
      writeFileSync(actual, png(true, [30, 20, 10, 255, 60, 50, 40, 255]));
      const run = () =>
        spawnSync(
          'python3',
          [resolve('scripts/verify-ios-icons.py'), app, source, join(root, 'actual.png')],
          { encoding: 'utf8' },
        );
      expect(run().status).toBe(0);
      writeFileSync(actual, png(true, [230, 220, 210, 255, 200, 190, 180, 255]));
      expect(run().status).not.toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
