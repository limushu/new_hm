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
const executable = join(root, '案笺.exe');
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
  const stateField = page.getByRole('combobox', { name: '案件状态', exact: true });
  await stateField.fill('#原生候选验收');
  await stateField.press('Enter');
  await expect(stateField).toHaveValue('#原生候选验收');
  await expect(stateField).toBeEnabled();
  const customStatusId = await stateField.getAttribute('data-value');
  workspace = await invoke(page, 'load_workspace');
  if (
    workspace.cases[0].statusId !== customStatusId ||
    !workspace.statuses.some((s) => s.id === customStatusId && s.name === '原生候选验收')
  )
    throw new Error('Native inline status creation was not persisted');
  await stateField.fill('未开始');
  await page.getByRole('option', { name: '#未开始', exact: true }).click();
  await expect(stateField).toHaveAttribute('data-value', 'not_started');
  // Private UI event only: never publish a fake version or start its installation.
  await invoke(page, 'plugin:event|emit', {
    event: 'update-available',
    payload: { version: '99.0.0', notes: '隔离事件测试，不会下载或安装' },
  });
  await page.getByRole('button', { name: '更新案笺到 99.0.0', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '安装 99.0.0', exact: true })).toBeVisible();
  await expect(page.getByLabel('优先更新源')).toHaveCount(0);
  await page.screenshot({ path: join(root, 'update-dialog.png') });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByLabel('案件名称', { exact: true })).toHaveValue('原生验收案件（虚构）');
  await invoke(page, 'plugin:event|emit', { event: 'update-available', payload: null });
  if (workspace.stages.length !== 5) throw new Error('Default stages missing');
  const middleStage = workspace.stages[1];
  const followingStage = workspace.stages[2];
  await invoke(page, 'save_stage', { input: { ...followingStage, state: 'current' } });
  await invoke(page, 'save_stage', { input: { ...middleStage, state: 'done' } });
  await invoke(page, 'save_stage', { input: { ...middleStage, state: 'pending' } });
  workspace = await invoke(page, 'load_workspace');
  if (
    workspace.stages[0].state !== 'pending' ||
    workspace.stages[1].state !== 'pending' ||
    workspace.stages[2].state !== 'current' ||
    !workspace.caseEvents.some((e) => e.title.includes('重新打开阶段'))
  )
    throw new Error('Native stage reopen reset unrelated progress or lost history');
  const typography = await page.context().newCDPSession(page);
  await typography.send('DOM.enable');
  await typography.send('CSS.enable');
  const { root: documentRoot } = await typography.send('DOM.getDocument');
  const { nodeId } = await typography.send('DOM.querySelector', {
    nodeId: documentRoot.nodeId,
    selector: '.sidebar nav button:nth-child(3)',
  });
  const { fonts } = await typography.send('CSS.getPlatformFontsForNode', { nodeId });
  console.log('Native Chinese UI font:', fonts.map((font) => font.familyName).join(', '));
  if (fonts.some((font) => /SimSun|Times New Roman/i.test(font.familyName)))
    throw new Error('Native UI unexpectedly uses serif fallback');
  await typography.detach();
  const iconCheck = spawnSync(
    'pwsh',
    [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      resolve('tests/native/inspect-icons.ps1'),
      '-TaskPid',
      String(pid),
      '-ExpectedExecutable',
      executable,
      '-OutputDirectory',
      root,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  if (iconCheck.status !== 0) throw new Error(iconCheck.stderr);
  console.log(iconCheck.stdout.trim());
  await page.getByRole('combobox', { name: '案件状态', exact: true }).click();
  await expect(page.getByRole('listbox', { name: '案件状态选项', exact: true })).toBeVisible();
  await page.screenshot({ path: join(root, 'case-menu.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('.case-page')).toBeVisible();
  await page.getByRole('button', { name: '添加待办', exact: true }).click();
  await page.getByLabel('待办内容', { exact: true }).fill('原生日期组件验收');
  await page.getByLabel('截止日期', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: '截止日期选择器', exact: true })).toBeVisible();
  await page.screenshot({ path: join(root, 'task-date.png') });
  await page
    .getByRole('dialog', { name: '截止日期选择器', exact: true })
    .getByRole('button', { name: '今天', exact: true })
    .click();
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await expect(page.locator('.todo-row')).toContainText('原生日期组件验收');
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
  const second = await invoke(page, 'add_proceeding', {
    caseId: item.id,
    kind: 'appeal',
    parentId: first,
  });
  const enforcement = await invoke(page, 'add_proceeding', {
    caseId: item.id,
    kind: 'enforcement',
    parentId: first,
  });
  await invoke(page, 'update_proceeding_meta', {
    input: { id: enforcement, parentId: first, state: 'completed' },
  });
  workspace = await invoke(page, 'load_workspace');
  if (
    workspace.cases[0].currentProceedingId !== null ||
    workspace.proceedings.filter((p) => p.state === 'active').length !== 2
  )
    throw new Error('Completing a focused program changed other programs');
  await invoke(page, 'update_proceeding_meta', {
    input: { id: enforcement, parentId: first, state: 'active' },
  });
  await invoke(page, 'set_proceeding_contacts', {
    input: { proceedingId: second, courtId: other.id, judgeId: null },
  });
  await invoke(page, 'select_proceeding', { caseId: item.id, proceedingId: first });
  await invoke(page, 'save_contact', { input: { ...court, name: '虚构甲法院新名称' } });
  await page.reload();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await expect(page.locator('.program-node')).toHaveCount(3);
  await expect(page.locator('.program-edges path')).toHaveCount(2);
  await page.getByRole('button', { name: '查看二审程序', exact: true }).click();
  workspace = await invoke(page, 'load_workspace');
  if (workspace.cases[0].currentProceedingId !== first)
    throw new Error('Browsing changed persistent focus');
  await page.getByRole('button', { name: '查看一审程序', exact: true }).click();
  const tags = page.getByRole('combobox', { name: '案件标签', exact: true });
  await tags.fill('#合同纠纷');
  await tags.press('Enter');
  await expect(page.getByRole('button', { name: '移除标签合同纠纷' })).toBeVisible();
  await page.getByRole('button', { name: '程序详情', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '办理法院', exact: true })).toHaveValue(
    '虚构甲法院新名称',
  );
  await expect(page.getByRole('combobox', { name: '承办法官', exact: true })).toHaveValue(
    '虚构法官',
  );
  await page.screenshot({ path: join(root, 'case-info.png') });
  for (const [width, height] of [
    [800, 600],
    [1024, 768],
    [1440, 960],
  ]) {
    const resized = spawnSync(
      'pwsh',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        resolve('tests/native/resize-owned-window.ps1'),
        '-TaskPid',
        String(pid),
        '-ExpectedExecutable',
        executable,
        '-Width',
        String(width),
        '-Height',
        String(height),
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    if (resized.status !== 0) throw new Error(resized.stderr);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    await expect
      .poll(() => page.locator('.case-page').evaluate((e) => e.scrollWidth - e.clientWidth))
      .toBeLessThanOrEqual(1);
    await page.locator('.case-page').evaluate((e) => (e.scrollTop = 0));
    await page.screenshot({ path: join(root, `case-info-${width}.png`) });
    await page.getByLabel('前序程序', { exact: true }).click();
    await expect(page.getByRole('listbox', { name: '前序程序选项', exact: true })).toBeVisible();
    await page.getByLabel('前序程序', { exact: true }).press('Escape');
  }
  const deletedCurrent = workspace.stages.find(
    (s) => s.proceedingId === second && s.state === 'current',
  );
  await page.getByRole('button', { name: '查看二审程序', exact: true }).click();
  await page.getByRole('button', { name: deletedCurrent.name, exact: true }).click();
  await page.getByRole('button', { name: '删除此阶段', exact: true }).click();
  const deleteStageDialog = page.getByRole('dialog', { name: '删除阶段', exact: true });
  await deleteStageDialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('.stage-current')).toHaveText(deletedCurrent.name);
  await page.getByRole('button', { name: deletedCurrent.name, exact: true }).click();
  await page.getByRole('button', { name: '删除此阶段', exact: true }).click();
  await deleteStageDialog.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.locator('.program-current-stage')).toContainText('尚未指定阶段');
  workspace = await invoke(page, 'load_workspace');
  if (
    workspace.stages.some((s) => s.id === deletedCurrent.id) ||
    workspace.proceedings.find((p) => p.id === second).stage !== '' ||
    workspace.stages.find((s) => s.id === followingStage.id).state !== 'current' ||
    workspace.materials.length !== 4 ||
    !workspace.caseEvents.some((e) => e.proceedingId === second && e.title === '删除阶段：材料准备')
  )
    throw new Error('Native stage deletion changed unrelated work or lost history');
  await page.screenshot({ path: join(root, 'stage-deletion.png') });
  await page.getByRole('button', { name: '查看一审程序', exact: true }).click();
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
  const today = new Date().toLocaleDateString('en-CA');
  const eventId = crypto.randomUUID();
  await invoke(page, 'save_calendar_event', {
    input: {
      id: eventId,
      caseId: item.id,
      title: '原生日历关联验收',
      startDate: today,
      endDate: today,
      startTime: '14:00',
      endTime: '14:30',
      location: '',
      notes: '',
      reminderMinutes: null,
    },
  });
  await page.reload();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.locator('.case-schedule-row').filter({ hasText: '原生日历关联验收' }).click();
  await page.getByLabel('日程名称', { exact: true }).fill('原生日历关联验收（已调整）');
  await page.getByRole('button', { name: '保存日程', exact: true }).click();
  workspace = await invoke(page, 'load_workspace');
  if (
    workspace.calendarEvents.length !== 1 ||
    workspace.calendarEvents[0].id !== eventId ||
    !workspace.calendarEvents[0].title.includes('已调整')
  )
    throw new Error('Case schedule duplicated or failed to edit original event');
  await page.screenshot({ path: join(root, 'case-overview.png') });
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
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
  if (
    workspace.proceedings.length !== 3 ||
    workspace.proceedings.find((p) => p.id === enforcement)?.parentId !== first ||
    !workspace.caseTags.some((t) => t.caseId === item.id && t.tag === '合同纠纷') ||
    workspace.calendarEvents[0]?.id !== eventId
  )
    throw new Error('New case overview data did not survive restore');
  // Exercise deletion against real SQLite in this owned, fictional workspace only.
  const deletionCase = await invoke(page, 'create_case', {
    input: {
      id: crypto.randomUUID(),
      title: '可删除关系验收（虚构）',
      caseType: 'civil',
      statusId: 'not_started',
    },
  });
  const deletedCourt = {
    id: crypto.randomUUID(),
    name: '可删除法院（虚构）',
    kind: 'court',
    phone: '',
    address: '',
    notes: '',
  };
  const retainedJudge = {
    ...deletedCourt,
    id: crypto.randomUUID(),
    name: '保留法官（虚构）',
    kind: 'judge',
  };
  await invoke(page, 'save_contact', { input: deletedCourt });
  await invoke(page, 'save_contact', { input: retainedJudge, courtIds: [deletedCourt.id] });
  await invoke(page, 'set_proceeding_contacts', {
    input: {
      proceedingId: deletionCase.currentProceedingId,
      courtId: deletedCourt.id,
      judgeId: retainedJudge.id,
    },
  });
  await page.reload();
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  const directoryRow = page
    .locator('.contact-directory-row')
    .filter({ has: page.locator('.row-main > span').filter({ hasText: deletedCourt.name }) });
  await directoryRow.locator('.row-main').click();
  const objectDetail = page.getByRole('dialog', { name: deletedCourt.name, exact: true });
  await expect(objectDetail.getByRole('region', { name: '对象资料' })).toContainText(
    deletedCourt.name,
  );
  await page.screenshot({ path: join(root, 'object-details.png') });
  await objectDetail.getByRole('button', { name: '删除对象', exact: true }).click();
  await page
    .getByRole('dialog', { name: '删除联系对象', exact: true })
    .getByRole('button', { name: '删除', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: '删除联系对象', exact: true })).toHaveCount(0);
  await expect(objectDetail).toHaveCount(0);
  workspace = await invoke(page, 'load_workspace');
  if (
    workspace.contacts.some((c) => c.id === deletedCourt.id) ||
    !workspace.contacts.some((c) => c.id === retainedJudge.id) ||
    workspace.contactLinks.some((l) => l.contactId === deletedCourt.id) ||
    workspace.contactRelations.some((r) => r.courtId === deletedCourt.id) ||
    workspace.proceedings.find((p) => p.id === deletionCase.currentProceedingId)?.court !==
      deletedCourt.name
  )
    throw new Error(
      'Deleting a linked object did not preserve independent data and history: ' +
        JSON.stringify({
          deletedCourt: deletedCourt.id,
          retainedJudge: retainedJudge.id,
          caseId: deletionCase.id,
          contacts: workspace.contacts.map((c) => ({ id: c.id, name: c.name })),
          links: workspace.contactLinks.filter((l) => l.caseId === deletionCase.id),
          relations: workspace.contactRelations,
          program: workspace.proceedings.find((p) => p.id === deletionCase.currentProceedingId),
          dialogs: await page.locator('dialog').evaluateAll((nodes) =>
            nodes.map((n) => ({
              label: n.getAttribute('aria-label'),
              open: n.open,
              text: n.textContent,
            })),
          ),
        }),
    );
  await invoke(page, 'delete_contact', { id: retainedJudge.id });
  await invoke(page, 'trash_case', { id: deletionCase.id });
  await invoke(page, 'purge_item', { kind: 'case', id: deletionCase.id, confirmed: true });
  await stop(page);
  page = await start();
  workspace = await invoke(page, 'load_workspace');
  if (
    workspace.materials.length !== 4 ||
    workspace.contacts.length !== 4 ||
    workspace.ledgerEntries.length !== 1
  )
    throw new Error('Persistence after restart failed');
  if (
    workspace.proceedings.length !== 3 ||
    workspace.caseTags[0]?.tag !== '合同纠纷' ||
    workspace.calendarEvents[0]?.id !== eventId ||
    workspace.cases[0].currentProceedingId !== first
  )
    throw new Error('Programs, tags, schedule or focus lost after restart');
  if (
    workspace.stages.find((s) => s.id === middleStage.id)?.state !== 'pending' ||
    workspace.stages.find((s) => s.id === followingStage.id)?.state !== 'current' ||
    workspace.stages.some((s) => s.id === deletedCurrent.id) ||
    workspace.proceedings.find((p) => p.id === second)?.stage !== '' ||
    !workspace.caseEvents.some(
      (e) => e.proceedingId === second && e.title === '删除阶段：材料准备',
    ) ||
    !workspace.caseEvents.some((e) => e.title.includes('重新打开阶段'))
  )
    throw new Error('Stage reopen and history did not survive restore/restart');
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
