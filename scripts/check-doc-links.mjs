import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(file) : file.endsWith('.md') ? [file] : [];
  });
}

const files = ['README.md', ...markdownFiles('docs')];
const errors = [];
let checked = 0;
for (const file of files) {
  const body = readFileSync(file, 'utf8');
  for (const match of body.matchAll(/!?\[[^\]]*\]\(([^\n)]+)\)/g)) {
    const link = match[1];
    if (/^[a-z]+:|^#/i.test(link)) continue;
    const path = resolve(dirname(file), decodeURIComponent(link.split('#')[0]));
    checked++;
    if (!existsSync(path)) errors.push(`${file}: ${link}`);
  }
}
if (errors.length) {
  console.error(`失效的本地文档链接：\n${errors.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`${files.length} 份文档中的 ${checked} 个本地链接均有效。`);
}
