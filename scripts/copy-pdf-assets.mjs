import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
const source = resolve('node_modules/pdfjs-dist');
const output = resolve('public/pdfjs');
mkdirSync(output, { recursive: true });
for (const name of ['cmaps', 'standard_fonts', 'wasm', 'LICENSE'])
  if (existsSync(join(source, name)))
    cpSync(join(source, name), join(output, name), { recursive: true });
console.log('Local PDF assets prepared.');
