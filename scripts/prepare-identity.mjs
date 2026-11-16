import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2] ?? join(root, 'artifacts/identity'));
mkdirSync(output, { recursive: true });
const files = [
  ['supabase/client.public.json', 'client.public.json'],
  ['supabase/migrations/202611160001_account_catalog.sql', 'account-catalog.sql'],
  ['supabase/functions/delete-account/handler.ts', 'delete-account/handler.ts'],
  ['supabase/functions/delete-account/index.ts', 'delete-account/index.ts'],
  ['docs/managed-identity.md', 'READ-ME.zh-CN.md'],
];
for (const [source, destination] of files) {
  const path = join(output, destination);
  mkdirSync(resolve(path, '..'), { recursive: true });
  if (source.endsWith('.md')) {
    const links = new Map(files);
    const content = readFileSync(join(root, source), 'utf8').replace(
      /\]\(([^)]+)\)/g,
      (match, target) => {
        if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) return match;
        const repositoryPath = relative(
          root,
          resolve(dirname(join(root, source)), target),
        ).replaceAll('\\', '/');
        return `](${links.get(repositoryPath) ?? `https://github.com/limushu/new_hm/blob/main/${repositoryPath}`})`;
      },
    );
    writeFileSync(path, content);
  } else copyFileSync(join(root, source), path);
}
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
writeFileSync(
  join(output, 'status.json'),
  JSON.stringify(
    {
      version: packageJson.version,
      status: 'prepared-not-deployed',
      providers: ['apple', 'google', 'azure'],
      storesCaseContent: false,
      realLoginVerified: false,
      cloudSyncAvailable: false,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Prepared hosted identity deployment material. No project, account, provider login or cloud sync has been activated.',
);
