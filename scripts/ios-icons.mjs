import { copyFileSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

/** iOS init installs template artwork. Replace every referenced slot after init. */
export function syncIosIcons(root) {
  const catalog = join(root, 'src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset');
  const source = join(root, 'src-tauri/icons/ios');
  const contents = JSON.parse(readFileSync(join(catalog, 'Contents.json'), 'utf8'));
  if (!contents.images?.length) throw new Error('Missing iOS AppIcon slots');
  const icons = contents.images.map((slot) => {
    const name = slot.filename;
    if (typeof name !== 'string' || basename(name) !== name || !name.endsWith('.png'))
      throw new Error('Invalid iOS icon slot filename');
    const file = join(source, name);
    const bytes = readFileSync(file);
    const size = slot.size?.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
    const scale = slot.scale?.match(/^(\d+)x$/);
    const header = bytes.indexOf(Buffer.from('IHDR')) + 4;
    if (
      !size ||
      !scale ||
      header < 4 ||
      bytes.readUInt32BE(header) !== Number(size[1]) * Number(scale[1]) ||
      bytes.readUInt32BE(header + 4) !== Number(size[2]) * Number(scale[1])
    )
      throw new Error(`Incorrect iOS icon dimensions: ${name}`);
    return { file, destination: join(catalog, name) };
  });
  for (const icon of icons) copyFileSync(icon.file, icon.destination);
  const normalized = spawnSync(
    'python3',
    [join(import.meta.dirname, 'verify-ios-icons.py'), '--prepare', catalog],
    { encoding: 'utf8' },
  );
  if (normalized.error || normalized.status !== 0)
    throw new Error(
      `Cannot prepare opaque RGB AppIcon images: ${normalized.stderr ?? normalized.error}`,
    );
  return icons.length;
}

export function verifyIosIcons(app, root, output) {
  const result = spawnSync(
    'python3',
    [join(root, 'scripts/verify-ios-icons.py'), app, join(root, 'src-tauri/icons/ios'), output],
    { encoding: 'utf8' },
  );
  if (result.error || result.status !== 0)
    throw new Error(`Bundled iOS icon verification failed: ${result.stderr ?? result.error}`);
  console.log(result.stdout.trim());
}
