import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';

// Exercise the bundled production frontend and real Windows IPC/SQLite, without
// replacing providers or touching an installed user's workspace.
if (process.platform !== 'win32') throw new Error('Windows native verification requires Windows');
const output = resolve('artifacts/windows-verification');
mkdirSync(output, { recursive: true });
mkdirSync(resolve('.local'), { recursive: true });
const root = mkdtempSync(resolve('.local/windows-release-'));
const executable = join(root, '案笺.exe');
copyFileSync(resolve(process.argv[2] ?? 'target/release/hm-app.exe'), executable);
mkdirSync(join(root, 'branding'));
copyFileSync('src-tauri/icons/icon.ico', join(root, 'branding/hm-mark.ico'));
writeFileSync(join(root, '.portable'), '');
const data = join(root, 'data');
mkdirSync(data);
const dbPath = join(data, 'workspace.sqlite3');
const ids = {
  case: '11111111-1111-4111-8111-111111111111',
  flow: '22222222-2222-4222-8222-222222222222',
  task: '33333333-3333-4333-8333-333333333333',
  contact: '44444444-4444-4444-8444-444444444444',
};
const title = 'Windows 升级验收案件（虚构）';
// These are the unchanged schema 1–7 migrations shipped in Windows 1.4.3.
const legacy = new DatabaseSync(dbPath);
for (const name of readdirSync('crates/hm-core/migrations').sort()) {
  if (Number(name.slice(0, 3)) <= 7)
    legacy.exec(readFileSync(join('crates/hm-core/migrations', name), 'utf8'));
}
legacy
  .prepare(
    'INSERT INTO cases(id,title,case_type,status_id,current_proceeding_id) VALUES(?,?,?,?,?)',
  )
  .run(ids.case, title, 'civil', 'not_started', ids.flow);
legacy
  .prepare('INSERT INTO proceedings(id,case_id,kind,name,category) VALUES(?,?,?,?,?)')
  .run(ids.flow, ids.case, 'first_instance', '一审', 'litigation');
legacy
  .prepare('INSERT INTO tasks(id,case_id,title) VALUES(?,?,?)')
  .run(ids.task, ids.case, '旧版待办保留');
legacy
  .prepare('INSERT INTO contacts(id,name,kind,phone) VALUES(?,?,?,?)')
  .run(ids.contact, '存量王律师（虚构）', 'person', '13800001234');
legacy
  .prepare(
    'INSERT INTO ledger_entries(id,case_id,kind,amount_cents,entry_date,category) VALUES(?,?,?,?,?,?)',
  )
  .run(crypto.randomUUID(), ids.case, 'expense', 12850, '2026-11-22', '差旅费');
legacy.exec(
  "INSERT INTO settings VALUES('onboarding_done','hm-welcome-1'),('notifications','false');",
);
assert.equal(legacy.prepare('PRAGMA user_version').get().user_version, 7);
assert.deepEqual(legacy.prepare('PRAGMA foreign_key_check').all(), []);
legacy.close();

let pid, browser, page;
let launches = 0;
const errors = [];
const report = {
  version: JSON.parse(readFileSync('package.json')).version,
  source: process.env.GITHUB_SHA ?? null,
  binarySource: existsSync('artifacts/windows-candidate.json')
    ? JSON.parse(readFileSync('artifacts/windows-candidate.json', 'utf8')).source
    : (process.env.GITHUB_SHA ?? null),
  checks: [],
  ok: false,
};
const invoke = (name, args = {}) =>
  page.evaluate(
    ([command, args]) => window.__TAURI_INTERNALS__.invoke(command, args),
    [name, args],
  );
function powershell(script, args = [], env = process.env) {
  const result = spawnSync(
    'pwsh',
    ['-NoProfile', '-NonInteractive', '-File', resolve(script), ...args],
    {
      env,
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
async function start() {
  launches++;
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  pid = Number(
    powershell(
      'tests/native/start-hidden.ps1',
      [
        '-Executable',
        executable,
        '-TaskDirectory',
        root,
        '-LogPrefix',
        join(root, `launch-${launches}`),
      ],
      {
        ...process.env,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`,
      },
    ),
  );
  console.log(`Started isolated Windows process ${pid}, launch ${launches}`);
  await expect(async () => {
    const endpoint = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
    assert.ok(endpoint.webSocketDebuggerUrl);
  }).toPass({ timeout: 30000 });
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = browser.contexts()[0].pages()[0];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('same key'))
      errors.push(message.text());
  });
  await page.getByRole('button', { name: '案件', exact: true }).waitFor();
}
async function stop() {
  if (pid) {
    try {
      await invoke('quit_app');
    } catch {}
    powershell('tests/native/stop-hidden.ps1', [
      '-TaskPid',
      String(pid),
      '-ExpectedExecutable',
      executable,
    ]);
    pid = null;
  }
  await browser?.close();
  browser = null;
}
async function openCase() {
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').filter({ hasText: title }).click();
  await expect(page.getByLabel('案件名称', { exact: true })).toHaveValue(title);
}
async function select(field, value) {
  const name = await field.getAttribute('aria-label');
  await field.click();
  await page
    .getByRole('listbox', { name: `${name}选项`, exact: true })
    .locator(`[role="option"][data-value="${value}"]`)
    .click();
  await expect(page.getByRole('listbox', { name: `${name}选项`, exact: true })).toHaveCount(0);
}
async function checkRetained() {
  const workspace = await invoke('load_workspace');
  assert.equal(workspace.cases.find((c) => c.id === ids.case)?.title, title);
  assert.equal(workspace.tasks.find((t) => t.id === ids.task)?.title, '旧版待办保留');
  assert.equal(workspace.ledgerEntries[0]?.amountCents, 12850);
  assert.ok(
    workspace.resourceMetadata.some((m) =>
      m.properties.some((p) => p.name === '审理结果' && p.value === '保留旧案，准备补充证据'),
    ),
  );
  assert.ok(
    workspace.resourceRelations.some(
      (r) => r.source.id === ids.flow && r.target.id === ids.contact,
    ),
  );
  assert.equal(workspace.materials.filter((m) => m.name === '验收证据.txt').length, 1);
  for (const tag of ['windows', '连续编辑'])
    assert.ok(workspace.caseTags.some((t) => t.tag === tag));
  assert.equal(workspace.cases.find((c) => c.id === ids.case)?.statusId, 'in_progress');
}
try {
  await start();
  let workspace = await invoke('load_workspace');
  assert.equal(workspace.cases[0].title, title);
  assert.equal(workspace.tasks[0].id, ids.task);
  const upgraded = new DatabaseSync(dbPath, { readOnly: true });
  assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version, 9);
  assert.equal(upgraded.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(upgraded.prepare('PRAGMA foreign_key_check').all(), []);
  upgraded.close();
  const backups = readdirSync(join(data, 'migration-backups'));
  assert.ok(backups.length > 0);
  const original = new DatabaseSync(join(data, 'migration-backups', backups[0]), {
    readOnly: true,
  });
  assert.equal(original.prepare('PRAGMA user_version').get().user_version, 7);
  assert.equal(original.prepare('SELECT title FROM cases WHERE id=?').get(ids.case).title, title);
  original.close();
  report.checks.push('real-schema-7-to-9-upgrade-and-original-backup');

  const manifest = await invoke('subsystem_manifest');
  const capabilities = manifest.subsystems.flatMap((s) =>
    s.state === 'ready' ? s.capabilities : [],
  );
  for (const capability of [
    'tray',
    'signed-updates',
    'record-audio',
    'backup-files',
    'system-notifications',
  ])
    assert.ok(capabilities.includes(capability), capability);
  for (const capability of ['account-login', 'transcribe-audio', 'system-calendar'])
    assert.ok(!capabilities.includes(capability), capability);
  assert.equal((await invoke('identity_status')).installed, false);
  assert.equal(await invoke('native_sync_provider'), null);
  assert.equal((await invoke('agenda_status')).calendar.installed, false);
  report.checks.push('installed-drivers-and-unavailable-services-reported-truthfully');

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await openCase();
  const name = page.getByLabel('案件名称', { exact: true });
  await name.fill('尚未确认的名称');
  for (const tag of ['Windows', '连续编辑']) {
    const tags = page.getByLabel('案件标签', { exact: true });
    await tags.fill(tag);
    await tags.press('Enter');
    await expect(tags).toBeEnabled();
  }
  await select(page.getByLabel('案件状态', { exact: true }), 'in_progress');
  await expect(page.locator('.save-state')).toHaveText('名称待保存');
  await page.getByRole('button', { name: '取消修改', exact: true }).click();
  await expect(name).toHaveValue(title);
  report.checks.push('continuous-header-edits-preserve-unconfirmed-title');

  await page.locator('.case-focus-main').click();
  const node = page.getByRole('dialog', { name: '节点详情', exact: true });
  await node.getByRole('button', { name: '添加属性', exact: true }).click();
  const property = page.getByRole('dialog', { name: '添加属性', exact: true });
  await property.getByLabel('属性名称', { exact: true }).fill('审理结果');
  await property.getByLabel('属性值', { exact: true }).fill('保留旧案，准备补充证据');
  await property.getByRole('button', { name: '保存属性', exact: true }).click();
  await expect(node).toContainText('保留旧案，准备补充证据');
  await node.getByRole('button', { name: '添加关联', exact: true }).click();
  const relation = page.getByRole('dialog', { name: '添加案件关联', exact: true });
  await select(relation.getByLabel('关联对象类型', { exact: true }), 'person');
  await expect(relation.getByLabel('选择 存量王律师（虚构）', { exact: true })).toHaveCount(0);
  await select(relation.getByLabel('关联对象范围', { exact: true }), 'directory');
  const person = relation.getByLabel('选择 存量王律师（虚构）', { exact: true });
  await person.check();
  await relation.getByLabel('关联说明', { exact: true }).fill('代理律师');
  await relation.getByRole('button', { name: '新建人物并关联', exact: true }).click();
  const create = page.getByRole('dialog', { name: '添加个人', exact: true });
  await create.getByLabel('对象名称', { exact: true }).fill('放弃创建的人物');
  await create.getByRole('button', { name: '取消', exact: true }).click();
  await expect(person).toBeChecked();
  await expect(relation.getByLabel('关联说明', { exact: true })).toHaveValue('代理律师');
  await relation.getByRole('button', { name: '保存关联', exact: true }).click();
  await expect(node).toContainText('存量王律师（虚构）');
  await page.screenshot({ path: join(output, 'node.png') });
  await node.getByRole('button', { name: '关闭', exact: true }).click();
  report.checks.push('single-form-properties-and-scoped-association-with-draft-retention');

  const source = join(root, '验收证据.txt');
  writeFileSync(source, '虚构证据原件；不得被导入或恢复改写。');
  const imported = await invoke('import_material_paths', {
    target: { caseId: ids.case, proceedingId: null, parentId: null, recordId: null },
    paths: [source],
  });
  assert.equal(imported.imported, 1);
  await page.reload();
  await openCase();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  await expect(page.locator('.material-row')).toContainText('验收证据.txt');
  await page.getByRole('tab', { name: '脉络', exact: true }).click();
  await page.screenshot({ path: join(output, 'timeline-dark.png') });
  report.checks.push('native-material-import-and-bundled-timeline');

  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(
    page.getByText('此平台暂不支持账号登录，可继续离线使用。', { exact: true }),
  ).toBeVisible();
  await openCase();
  for (const [width, height] of [
    [800, 600],
    [1440, 960],
  ]) {
    powershell('tests/native/resize-owned-window.ps1', [
      '-TaskPid',
      String(pid),
      '-ExpectedExecutable',
      executable,
      '-Width',
      String(width),
      '-Height',
      String(height),
    ]);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    for (const tab of ['脉络', '材料', '人员', '费用']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      const panel = page.getByRole('region', { name: '案件详情', exact: true });
      assert.ok(await panel.evaluate((el) => el.scrollWidth - el.clientWidth <= 1));
      await expect(
        page.getByRole('navigation', { name: '案件快捷操作', exact: true }),
      ).toBeInViewport();
    }
  }
  await page.screenshot({ path: join(output, 'finance-light.png') });
  report.checks.push('light-dark-themes-and-all-case-tabs-at-800-and-1440');

  await invoke('set_setting', { key: 'backup_directory', value: join(root, 'backups') });
  const backup = await invoke('run_backup');
  await invoke('trash_case', { id: ids.case });
  assert.equal((await invoke('load_workspace')).cases.filter((c) => !c.deletedAt).length, 0);
  await invoke('apply_restore_backup', { path: backup.directory, confirmed: true });
  await checkRetained();
  await stop();
  await start();
  await checkRetained();
  assert.equal(readFileSync(source, 'utf8'), '虚构证据原件；不得被导入或恢复改写。');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  report.checks.push('backup-restore-and-real-process-restart-retain-all-objects-and-files');
  assert.deepEqual(errors, []);
  report.ok = true;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.error = String(error);
  for (let launch = 1; launch <= launches; launch++) {
    for (const kind of ['stdout', 'stderr']) {
      const path = join(root, `launch-${launch}.${kind}.log`);
      if (existsSync(path)) {
        const message = readFileSync(path, 'utf8');
        console.log(`Launch ${launch} ${kind}:`, message);
        writeFileSync(join(output, `launch-${launch}.${kind}.log`), message);
      }
    }
  }
  const current = new DatabaseSync(dbPath, { readOnly: true });
  report.startupSchema = current.prepare('PRAGMA user_version').get().user_version;
  current.close();
  try {
    await page?.screenshot({ path: join(output, 'failure.png') });
  } catch {}
  throw error;
} finally {
  report.pageErrors = errors;
  writeFileSync(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  await stop();
}
