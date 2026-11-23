import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = 'src-tauri/gen/android/app/src/main';
mkdirSync(join(root, 'java/com/limushu/hm'), { recursive: true });
mkdirSync(join(root, 'res/xml'), { recursive: true });
copyFileSync(
  'src-tauri/android/MainActivity.kt',
  join(root, 'java/com/limushu/hm/MainActivity.kt'),
);
copyFileSync(
  'src-tauri/android/data_extraction_rules.xml',
  join(root, 'res/xml/data_extraction_rules.xml'),
);
const path = join(root, 'AndroidManifest.xml');
let manifest = readFileSync(path, 'utf8');
manifest = manifest.replace(
  /\s+android:(?:allowBackup|fullBackupContent|dataExtractionRules|windowSoftInputMode)="[^"]*"/g,
  '',
);
if (!manifest.includes('<application') || !manifest.includes('android:name=".MainActivity"'))
  throw new Error('Unrecognized Android host template');
manifest = manifest.replace(
  '<application',
  '<application android:allowBackup="false" android:fullBackupContent="false" android:dataExtractionRules="@xml/data_extraction_rules"',
);
manifest = manifest.replace(
  'android:name=".MainActivity"',
  'android:name=".MainActivity" android:windowSoftInputMode="adjustResize"',
);
writeFileSync(path, manifest);
console.log('Android private-cache, backup policy and host activity configured.');
