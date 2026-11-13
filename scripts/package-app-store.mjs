import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2] ?? join(root, 'artifacts/app-store/materials'));
const metadata = JSON.parse(readFileSync(join(root, 'docs/app-store/metadata.zh-CN.json'), 'utf8'));
const limits = { name: 30, subtitle: 30, promotionalText: 170, keywords: 100, description: 4000 };
for (const [field, limit] of Object.entries(limits)) {
  const count = [...metadata[field]].length;
  if (count > limit) throw new Error(`${field} exceeds ${limit} characters: ${count}`);
}
for (const directory of ['text', 'reference', 'policy'])
  mkdirSync(join(output, directory), { recursive: true });
for (const [file, content] of Object.entries({
  'app-name.txt': metadata.name,
  'subtitle.txt': metadata.subtitle,
  'description.txt': metadata.description,
  'keywords.txt': metadata.keywords,
  'promotional-text.txt': metadata.promotionalText,
  'review-notes-en.txt': metadata.reviewNotes,
  'copyright.txt': '2026 李浩',
  'privacy-policy-url.txt': metadata.privacyPolicyUrl,
  'support-url.txt': metadata.supportUrl,
}))
  writeFileSync(join(output, 'text', file), content + '\n');
cpSync(join(root, 'docs/app-store/metadata.zh-CN.json'), join(output, 'metadata.zh-CN.json'));
cpSync(join(root, 'docs/app-store/submission-guide.zh-CN.md'), join(output, 'READ-ME.zh-CN.md'));
cpSync(join(root, 'docs/app-store/README.md'), join(output, 'reference/release-readiness.md'));
cpSync(
  join(root, 'src-tauri/icons/ios/AppIcon-512@2x.png'),
  join(output, 'reference/app-icon-1024.png'),
);
cpSync(join(root, 'docs/privacy-policy.md'), join(output, 'policy/privacy-policy.md'));
cpSync(join(root, 'docs/app-store/support.md'), join(output, 'policy/support.md'));
cpSync(join(root, 'docs/app-store/site'), join(output, 'policy/site'), { recursive: true });
const links = {
  'READ-ME.zh-CN.md': { '(README.md)': '(reference/release-readiness.md)' },
  'policy/privacy-policy.md': {},
  'policy/support.md': { '(../privacy-policy.md)': '(privacy-policy.md)' },
};
for (const [name, replacements] of Object.entries(links)) {
  const path = join(output, name);
  let content = readFileSync(path, 'utf8');
  for (const [before, after] of Object.entries(replacements))
    content = content.replaceAll(before, after);
  writeFileSync(path, content);
}
console.log(
  'Prepared copyable store fields and reference material. No App Store submission performed.',
);
