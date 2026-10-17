import { chromium, expect } from '@playwright/test';
import {
  copyFileSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
if (process.platform !== 'win32') throw new Error('Native smoke test requires Windows');
mkdirSync(resolve('.local'), { recursive: true });
const root = mkdtempSync(join(resolve('.local'), 'native-v1-'));
const executable = join(root, '律师工作台.exe');
copyFileSync(resolve(process.argv[2] ?? 'target/release/hm-app.exe'), executable);
writeFileSync(join(root, '.portable'), '');
let pid, browser;
const logs = [];
async function start() {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  const result = spawnSync(
    'pwsh',
    [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      resolve('tests/native/start-hidden.ps1'),
      '-Executable',
      executable,
      '-TaskDirectory',
      root,
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`,
      },
    },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  pid = Number(result.stdout.trim());
  let endpoint;
  for (let i = 0; i < 100; i++) {
    try {
      endpoint = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
      if (endpoint.webSocketDebuggerUrl) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!endpoint?.webSocketDebuggerUrl) throw new Error('Owned native app CDP endpoint missing');
  browser = await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl);
  const page = browser.contexts()[0].pages()[0];
  page.on('pageerror', (error) => logs.push(error.message));
  await page.getByRole('button', { name: '案件', exact: true }).waitFor();
  console.log('Owned native page:', page.url());
  return page;
}
const invoke = (page, name, args = {}) =>
  page.evaluate(([name, args]) => window.__TAURI_INTERNALS__.invoke(name, args), [name, args]);
async function stop(page) {
  if (pid) {
    try {
      if (page) await invoke(page, 'quit_app');
    } catch {}
    const result = spawnSync(
      'pwsh',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        resolve('tests/native/stop-hidden.ps1'),
        '-TaskPid',
        String(pid),
        '-ExpectedExecutable',
        executable,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    if (result.status !== 0) throw new Error(result.stderr);
    pid = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}
function pdf() {
  const contents = 'BT /F1 18 Tf 50 700 Td (Native Test PDF) Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(contents)} >>\nstream\n${contents}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let value = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(value));
    value += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const at = Buffer.byteLength(value);
  value +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${at}\n%%EOF`;
  return value;
}
let page;
try {
  page = await start();
  await invoke(page, 'set_setting', { key: 'notifications', value: 'false' });
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.getByRole('button', { name: '新建案件', exact: true }).click();
  await page.getByRole('textbox', { name: '案件名称', exact: true }).fill('原生验收案件（虚构）');
  await page.getByRole('textbox', { name: '案件名称', exact: true }).press('Enter');
  await expect(page.locator('.save-state')).toHaveText('已保存');
  let workspace = await invoke(page, 'load_workspace');
  const item = workspace.cases[0];
  if (workspace.stages.length !== 5) throw new Error('Default stages missing');
  const source = join(root, '原始证据.txt');
  writeFileSync(source, 'original evidence');
  const pdfPath = join(root, '阅读示例.pdf');
  writeFileSync(pdfPath, pdf());
  const target = { caseId: item.id, proceedingId: null, parentId: null, recordId: null };
  let report = await invoke(page, 'import_material_paths', {
    target,
    paths: [source, source, pdfPath],
  });
  if (report.imported !== 3 || report.errors.length) throw new Error(JSON.stringify(report));
  workspace = await invoke(page, 'load_workspace');
  if (!workspace.materials.some((m) => m.name === '原始证据 (1).txt'))
    throw new Error('Duplicate retention failed');
  const file = workspace.materials.find((m) => m.name === '原始证据.txt');
  await invoke(page, 'rename_material', { id: file.id, name: '已改名证据.txt' });
  const storedPath = await invoke(page, 'material_preview', {
    id: workspace.materials.find((m) => m.name === '阅读示例.pdf').id,
  });
  if (!storedPath.includes('materials')) throw new Error('Preview path is not managed');
  if (readFileSync(source, 'utf8') !== 'original evidence') throw new Error('Source changed');
  await page.reload();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('button', { name: '材料', exact: true }).click();
  await expect(page.locator('.material-row')).toHaveCount(3);
  await page.getByRole('button', { name: '阅读示例.pdf', exact: true }).dblclick();
  await expect(
    page
      .getByRole('dialog', { name: '预览 阅读示例.pdf', exact: true })
      .locator('.preview-controls'),
  ).toContainText('1 / 1', { timeout: 20000 });
  await page.getByRole('button', { name: '关闭预览', exact: true }).click();
  await page.getByRole('button', { name: '录音', exact: true }).click();
  await page.getByRole('textbox', { name: '录音名称', exact: true }).fill('中文会见录音.webm');
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.locator('.recording-clock')).toHaveText('00:01', { timeout: 5000 });
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '结束录音', exact: true }).click();
  await page.getByRole('button', { name: '保存录音', exact: true }).click();
  await expect(page.locator('.material-row').filter({ hasText: '中文会见录音.webm' })).toHaveCount(
    1,
    { timeout: 10000 },
  );
  workspace = await invoke(page, 'load_workspace');
  await page.screenshot({ path: join(root, 'materials.png') });
  const audio = workspace.materials.find((m) => m.name === '中文会见录音.webm');
  if (!audio || audio.size === 0) throw new Error('Native recording bytes missing');
  await page.getByRole('button', { name: '中文会见录音.webm', exact: true }).dblclick();
  const player = page
    .getByRole('dialog', { name: '预览 中文会见录音.webm', exact: true })
    .locator('audio');
  await expect
    .poll(() => player.evaluate((element) => element.readyState))
    .toBeGreaterThanOrEqual(2);
  await player.evaluate(async (element) => {
    element.muted = true;
    await element.play();
  });
  await expect.poll(() => player.evaluate((element) => element.currentTime)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '关闭预览', exact: true }).click();
  const person = {
    id: crypto.randomUUID(),
    name: '虚构联系人乙',
    kind: 'person',
    phone: '',
    address: '',
    notes: '',
  };
  await invoke(page, 'save_contact', { input: person });
  await invoke(page, 'save_contact_link', {
    input: {
      id: crypto.randomUUID(),
      caseId: item.id,
      contactId: person.id,
      proceedingId: null,
      role: '委托人',
    },
  });
  await invoke(page, 'save_ledger', {
    input: {
      id: crypto.randomUUID(),
      caseId: item.id,
      proceedingId: null,
      kind: 'expense',
      amountCents: 101,
      entryDate: '2026-10-18',
      category: '交通费',
      notes: '测试',
      reimbursement: 'pending',
      materialId: file.id,
    },
  });
  const court = { ...person, id: crypto.randomUUID(), name: '虚构甲法院', kind: 'court' };
  const other = { ...court, id: crypto.randomUUID(), name: '虚构乙法院' };
  const judge = { ...person, id: crypto.randomUUID(), name: '虚构法官', kind: 'judge' };
  await invoke(page, 'save_contact', { input: court });
  await invoke(page, 'save_contact', { input: other });
  await invoke(page, 'save_contact', { input: judge, courtIds: [court.id] });
  const first = item.currentProceedingId;
  await invoke(page, 'set_proceeding_contacts', {
    input: { proceedingId: first, courtId: court.id, judgeId: judge.id },
  });
  const second = await invoke(page, 'add_proceeding', { caseId: item.id, kind: 'appeal' });
  await invoke(page, 'set_proceeding_contacts', {
    input: { proceedingId: second, courtId: other.id, judgeId: null },
  });
  await invoke(page, 'select_proceeding', { caseId: item.id, proceedingId: first });
  await invoke(page, 'save_contact', { input: { ...court, name: '虚构甲法院新名称' } });
  await page.reload();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('button', { name: '案件信息', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '办理法院', exact: true })).toHaveValue(
    '虚构甲法院新名称',
  );
  await expect(page.getByRole('combobox', { name: '承办法官', exact: true })).toHaveValue(
    '虚构法官',
  );
  await page.screenshot({ path: join(root, 'case-info.png') });
  await page.getByRole('button', { name: '查看法院关联', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '虚构甲法院新名称', exact: true });
  await expect(detail).toContainText('虚构法官');
  await detail.getByRole('button', { name: '局部关系图', exact: true }).click();
  await page.screenshot({ path: join(root, 'relations.png') });
  await detail.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.getByRole('textbox', { name: '案号', exact: true }).fill('原生案号-2026');
  await page
    .getByRole('button', { name: '返回主页面', exact: true })
    .click({ position: { x: 30, y: 300 } });
  await expect(page.locator('.case-page')).toHaveCount(0);
  await invoke(page, 'set_setting', { key: 'backup_directory', value: join(root, 'backups') });
  console.log('Before manual backup');
  const backup = await invoke(page, 'run_backup');
  console.log('Manual backup ready', backup.fileCount);
  await invoke(page, 'set_case_status', { id: item.id, statusId: 'closed' });
  console.log('Before restore');
  await invoke(page, 'apply_restore_backup', { path: backup.directory, confirmed: true });
  console.log('Restore complete');
  workspace = await invoke(page, 'load_workspace');
  if (
    workspace.cases[0].statusId !== 'not_started' ||
    workspace.contacts.length !== 4 ||
    workspace.ledgerEntries[0].amountCents !== 101 ||
    workspace.materials.length !== 4
  )
    throw new Error('Native restore mismatch');
  if (
    workspace.proceedings.find((p) => p.id === first)?.caseNumber !== '原生案号-2026' ||
    workspace.proceedings.find((p) => p.id === first)?.court !== '虚构甲法院新名称' ||
    workspace.contactRelations.length !== 1
  )
    throw new Error('Native relation or field flush did not survive restore');
  if (!existsSync(join(root, 'data', 'recovery'))) throw new Error('Recovery snapshot missing');
  await stop(page);
  page = await start();
  workspace = await invoke(page, 'load_workspace');
  if (
    workspace.materials.length !== 4 ||
    workspace.contacts.length !== 4 ||
    workspace.ledgerEntries.length !== 1
  )
    throw new Error('Persistence after restart failed');
  await page.screenshot({ path: join(root, 'board.png') });
  if (process.env.HM_CHECK_UPDATE === '1') {
    const update = await invoke(page, 'check_update');
    console.log('Native update service check:', JSON.stringify(update));
    if (update !== null) throw new Error('Unexpected version in published update service');
  }
  await stop(page);
  console.log(
    'PASS: native case/stages, copy import/duplicates/rename, PDF asset worker preview, fake microphone pause/resume + binary recording IPC, contacts, exact ledger cents, backup/restore/recovery, and restart persistence. Isolated data only.',
  );
  writeFileSync(
    join(root, 'result.json'),
    JSON.stringify({ ok: true, logs, workspaceDirectory: join(root, 'data') }, null, 2),
  );
} catch (error) {
  console.log('Native test directory:', root);
  console.log('Page errors:', logs);
  try {
    await page?.screenshot({ path: join(root, 'failure.png') });
  } catch {}
  throw error;
} finally {
  await stop(page);
}
