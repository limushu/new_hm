import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

if (process.platform !== 'win32') throw new Error('Windows native verification requires Windows');
const output = resolve('artifacts/windows-verification');
mkdirSync(output, { recursive: true });
mkdirSync(resolve('.local'), { recursive: true });
const root = mkdtempSync(resolve('.local/windows-sdk-'));
const executable = join(root, `anjian-native-${crypto.randomUUID()}.exe`);
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
  material: '55555555-5555-4555-8555-555555555555',
  record: '66666666-6666-4666-8666-666666666666',
};
const title = 'Windows 升级验收案件（虚构）';
const body = '虚构工作记录：核对材料并联系当事人。';
const evidence = '虚构证据原件，升级与备份应保留这些字节。';
const archived = join(data, 'materials', ids.case, ids.material, 'evidence.txt');
mkdirSync(join(data, 'materials', ids.case, ids.material), { recursive: true });
writeFileSync(archived, evidence);
// Build the actual schema shipped in Windows 1.4.3; never downgrade a newer DB.
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
  .prepare('INSERT INTO contact_links(id,contact_id,case_id,role) VALUES(?,?,?,?)')
  .run(crypto.randomUUID(), ids.contact, ids.case, '代理律师');
legacy
  .prepare(
    'INSERT INTO ledger_entries(id,case_id,kind,amount_cents,entry_date,category) VALUES(?,?,?,?,?,?)',
  )
  .run(crypto.randomUUID(), ids.case, 'expense', 12850, '2026-11-22', '差旅费');
legacy
  .prepare('INSERT INTO work_records(id,case_id,body) VALUES(?,?,?)')
  .run(ids.record, ids.case, body);
legacy
  .prepare(
    'INSERT INTO materials(id,case_id,record_id,name,kind,storage_name,size) VALUES(?,?,?,?,?,?,?)',
  )
  .run(
    ids.material,
    ids.case,
    ids.record,
    '升级证据.txt',
    'file',
    'evidence.txt',
    Buffer.byteLength(evidence),
  );
legacy
  .prepare('INSERT INTO calendar_events(id,title,start_date,end_date,case_id) VALUES(?,?,?,?,?)')
  .run(crypto.randomUUID(), '虚构开庭安排', '2026-12-01', '2026-12-01', ids.case);
legacy.exec(
  "INSERT INTO settings VALUES('onboarding_done','hm-welcome-1'),('notifications','false'),('close_to_tray','false');",
);
assert.equal(legacy.prepare('PRAGMA user_version').get().user_version, 7);
assert.deepEqual(legacy.prepare('PRAGMA foreign_key_check').all(), []);
legacy.close();

let child;
let launches = 0;
const report = {
  version: JSON.parse(readFileSync('package.json', 'utf8')).version,
  source: process.env.GITHUB_SHA ?? null,
  binarySource: existsSync('artifacts/windows-candidate.json')
    ? JSON.parse(readFileSync('artifacts/windows-candidate.json', 'utf8')).source
    : (process.env.GITHUB_SHA ?? null),
  mode: 'windows-sdk-startup-and-persistence',
  checks: [],
  ok: false,
  limitations: [
    'Full native UI interaction automation is not covered; release WebView2 ignores the attempted debugger configuration. Shared browser interaction and Windows core suites are separate checks.',
  ],
};
function checked(name) {
  report.checks.push(name);
  console.log(`PASS: ${name}`);
}
function powershell(script, args) {
  const result = spawnSync(
    'pwsh',
    ['-NoProfile', '-NonInteractive', '-File', resolve(script), ...args],
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30000,
    },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
function verifyData(path, version) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, version);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('SELECT title FROM cases WHERE id=?').get(ids.case).title, title);
    assert.equal(db.prepare('SELECT name FROM proceedings WHERE id=?').get(ids.flow).name, '一审');
    assert.equal(
      db.prepare('SELECT title FROM tasks WHERE id=?').get(ids.task).title,
      '旧版待办保留',
    );
    assert.equal(db.prepare('SELECT body FROM work_records WHERE id=?').get(ids.record).body, body);
    assert.equal(db.prepare('SELECT amount_cents FROM ledger_entries').get().amount_cents, 12850);
    assert.equal(
      db.prepare('SELECT name FROM contacts WHERE id=?').get(ids.contact).name,
      '存量王律师（虚构）',
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM calendar_events').get().n, 1);
    assert.equal(
      db.prepare('SELECT storage_name FROM materials WHERE id=?').get(ids.material).storage_name,
      'evidence.txt',
    );
  } finally {
    db.close();
  }
}
async function start() {
  launches++;
  const stdout = openSync(join(output, `launch-${launches}.stdout.log`), 'w');
  const stderr = openSync(join(output, `launch-${launches}.stderr.log`), 'w');
  try {
    child = spawn(executable, [], { cwd: root, stdio: ['ignore', stdout, stderr] });
    await new Promise((done, reject) => {
      child.once('spawn', done);
      child.once('error', reject);
    });
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
  console.log(`Started owned release process ${child.pid}`);
  await expect(async () => {
    assert.equal(child.exitCode, null, 'Release process exited during startup');
    verifyData(dbPath, 9);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      assert.ok(db.prepare("SELECT value FROM settings WHERE key='last_backup_date'").get()?.value);
    } finally {
      db.close();
    }
  }).toPass({ timeout: 45000 });
}
async function stop() {
  if (child?.pid && child.exitCode === null) {
    powershell('tests/native/stop-hidden.ps1', [
      '-TaskPid',
      String(child.pid),
      '-ExpectedExecutable',
      executable,
    ]);
    await expect.poll(() => child.exitCode).not.toBeNull();
    assert.equal(child.exitCode, 0, 'Owned app did not exit cleanly');
  }
}
function inspectWindow(label) {
  powershell('tests/native/inspect-startup.ps1', [
    '-TaskPid',
    String(child.pid),
    '-ExpectedExecutable',
    executable,
    '-OutputDirectory',
    output,
  ]);
  const state = JSON.parse(
    readFileSync(join(output, 'startup-processes.json'), 'utf8').replace(/^\uFEFF/, ''),
  );
  assert.ok(state.mainWindow.includes('案笺'));
  assert.ok(
    state.processes.some(
      (p) => p.Name === 'msedgewebview2.exe' && p.CommandLine.includes('--type=renderer'),
    ),
  );
  assert.ok(existsSync(join(output, 'startup-window.png')));
  assert.ok(state.windowImage?.renderedColors > 10, 'Native WebView has no rendered content');
  if (label === 'native-800') {
    assert.equal(state.windowImage.clientWidth, 800);
    assert.equal(state.windowImage.clientHeight, 600);
  }
  renameSync(join(output, 'startup-window.png'), join(output, `${label}.png`));
  renameSync(join(output, 'startup-processes.json'), join(output, `${label}.json`));
}
try {
  await start();
  checked('real-release-startup-schema-7-to-9-and-all-legacy-business-data');
  const original = readdirSync(join(data, 'migration-backups')).find((name) =>
    name.endsWith('.sqlite3'),
  );
  assert.ok(original);
  verifyData(join(data, 'migration-backups', original), 7);
  assert.equal(readFileSync(archived, 'utf8'), evidence);
  checked('original-schema-7-database-and-material-bytes-retained');
  inspectWindow('native-startup');
  checked('real-win32-window-and-rendered-webview2-production-ui');
  const backups = join(data, 'backups');
  const folder = readdirSync(backups).find((name) =>
    existsSync(join(backups, name, 'manifest.json')),
  );
  assert.ok(folder);
  const backup = join(backups, folder);
  const manifest = JSON.parse(readFileSync(join(backup, 'manifest.json'), 'utf8'));
  for (const [name, digest] of Object.entries(manifest.files)) {
    assert.equal(
      createHash('sha256')
        .update(readFileSync(join(backup, name)))
        .digest('hex'),
      digest,
    );
  }
  verifyData(join(backup, 'workspace.sqlite3'), 9);
  assert.ok(Object.keys(manifest.files).some((name) => name.startsWith('materials/')));
  checked('real-background-complete-backup-database-materials-and-all-checksums');
  powershell('tests/native/resize-owned-window.ps1', [
    '-TaskPid',
    String(child.pid),
    '-ExpectedExecutable',
    executable,
    '-Width',
    '800',
    '-Height',
    '600',
  ]);
  inspectWindow('native-800');
  checked('owned-native-window-resize-and-rendering-at-800x600');
  await stop();
  await start();
  verifyData(dbPath, 9);
  assert.equal(readFileSync(archived, 'utf8'), evidence);
  inspectWindow('native-reopened');
  checked('clean-exit-real-process-restart-and-business-file-persistence');
  await stop();
  report.ok = true;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.error = String(error);
  console.error(error);
  throw error;
} finally {
  writeFileSync(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  await stop();
}
