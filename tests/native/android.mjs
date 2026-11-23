// Owned debug WebView on an SDK emulator. No preview repository or SDK mocks.
import { _android as android, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = 'artifacts/android-emulator';
mkdirSync(out, { recursive: true });
const checks = [];
const errors = [];
const pkg = 'com.limushu.hm';
const title = 'Android 验收案件（虚构）';
const evidenceName = 'android-evidence.txt';
const evidence = 'Fictional Android document provider evidence.\n';
const shell = (...args) => execFileSync('adb', ['shell', ...args], { encoding: 'utf8' });
const invoke = (page, name, args = {}) =>
  page.evaluate(([name, args]) => window.__TAURI_INTERNALS__.invoke(name, args), [name, args]);
function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)],
  );
}
const apk = files('src-tauri/gen/android/app/build/outputs/apk').find((p) => p.endsWith('.apk'));
if (!apk) throw new Error('Debug emulator APK missing');
writeFileSync(
  `${out}/bootstrap.json`,
  JSON.stringify({ stage: 'connect-adb', source: process.env.ANDROID_APK_SOURCE_SHA }),
);
console.log('BOOTSTRAP connect-adb');
let [device] = await android.devices();
if (!device) throw new Error('SDK emulator missing');
device.setDefaultTimeout(20000);
let page;
async function start() {
  shell('am', 'start', '-n', `${pkg}/.MainActivity`);
  console.log('BOOTSTRAP activity started; waiting for WebView');
  const view = await device.webView({ pkg }, { timeout: 45000 });
  console.log('BOOTSTRAP WebView detected');
  page = await view.page();
  console.log('BOOTSTRAP WebView connected');
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('button', { name: '案件', exact: true })).toBeVisible();
}
function selectorPending(error) {
  return /Timeout|Timed out waiting for selector/i.test(String(error));
}
async function nativeWait(selector) {
  await expect
    .poll(
      async () => {
        try {
          await device.wait(selector, { timeout: 1000 });
          return true;
        } catch (error) {
          if (!selectorPending(error)) throw error;
          return false;
        }
      },
      { timeout: 30000 },
    )
    .toBe(true);
}
async function pickerCommit(selector, completed) {
  await nativeWait({ ...selector, pkg: /.*documentsui/ });
  try {
    await device.tap({ ...selector, pkg: /.*documentsui/ }, { timeout: 1000 });
  } catch (error) {
    // UiAutomator can report a stale selector after its click closes the picker.
    // Never retry a committed action against the underlying app; verify its result.
    if (!selectorPending(error)) throw error;
  }
  await completed();
}
async function touch(locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const point = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2,
      y = r.top + r.height / 2;
    if (!el.contains(document.elementFromPoint(x, y))) throw new Error('Touch target is obscured');
    return { x, y };
  });
  // Use the real Android input driver, with the native WebView's screen bounds.
  let bounds;
  await expect
    .poll(
      async () => {
        try {
          bounds = (await device.info({ pkg, clazz: /.*WebView/ })).bounds;
          return bounds.width > 0;
        } catch (error) {
          if (!selectorPending(error)) throw error;
          return false;
        }
      },
      { timeout: 20000 },
    )
    .toBe(true);
  const viewport = await page.evaluate(() => ({
    width: visualViewport.width,
    top: visualViewport.offsetTop,
  }));
  const ratio = bounds.width / viewport.width;
  await device.input.tap({
    x: Math.round(bounds.x + point.x * ratio),
    y: Math.round(bounds.y + (point.y - viewport.top) * ratio),
  });
}
async function back() {
  // A foreign launcher ANR can steal key events during a cold SDK boot.
  // Dismiss only that system fixture failure; never suppress an app ANR.
  try {
    await device.wait({ text: /^Pixel Launcher isn't responding$/ }, { timeout: 300 });
    await device.tap({ text: /^[Cc]lose app$/ });
    console.log('Dismissed SDK launcher ANR (application not involved)');
  } catch (error) {
    if (!selectorPending(error)) throw error;
  }
  await device.input.press('Back');
}
async function hideKeyboard() {
  // Avoid treating a keyboard-dismissal key as a second application Back.
  if (/mInputShown=true|isInputViewShown=true/.test(shell('dumpsys', 'input_method'))) await back();
  await page.locator('body').click({ position: { x: 3, y: 3 } });
}
async function chooseDownload(name, completed) {
  // The system picker opens outside the WebView. Use its actual accessibility tree.
  await pickerCommit({ desc: 'Show roots' }, () =>
    nativeWait({ text: 'Downloads', res: 'android:id/title', pkg: /.*documentsui/ }),
  );
  await pickerCommit({ text: 'Downloads', res: 'android:id/title' }, () =>
    nativeWait({ text: name, pkg: /.*documentsui/ }),
  );
  await pickerCommit({ text: name }, completed);
}
async function record(name) {
  checks.push(name);
  console.log(`PASS ${name}`);
  writeFileSync(
    `${out}/results.json`,
    JSON.stringify(
      {
        apkSource: process.env.ANDROID_APK_SOURCE_SHA ?? process.env.GITHUB_SHA,
        harnessSource: process.env.GITHUB_SHA,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  await device.screenshot({ path: `${out}/${String(checks.length).padStart(2, '0')}.png` });
}
try {
  writeFileSync(
    `${out}/bootstrap.json`,
    JSON.stringify({ stage: 'install', source: process.env.ANDROID_APK_SOURCE_SHA }),
  );
  console.log('BOOTSTRAP install using SDK adb');
  execFileSync('adb', ['install', '--no-streaming', '-r', '-t', apk], {
    stdio: 'inherit',
    timeout: 120000,
  });
  writeFileSync(
    `${out}/bootstrap.json`,
    JSON.stringify({ stage: 'launch', source: process.env.ANDROID_APK_SOURCE_SHA }),
  );
  console.log('BOOTSTRAP launch');
  await start();
  const welcome = page.getByRole('dialog', { name: '欢迎使用案笺', exact: true });
  await welcome.getByRole('button', { name: '开始使用', exact: true }).click();
  const manifest = await invoke(page, 'subsystem_manifest');
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
  const capabilities = manifest.subsystems.flatMap((s) => s.capabilities ?? []);
  if (!capabilities.includes('system-back')) throw new Error('Android Back driver missing');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.getByRole('button', { name: '新建案件', exact: true }).click();
  await page.getByLabel('案件名称', { exact: true }).fill(title);
  await page.getByRole('button', { name: '创建案件', exact: true }).click();
  await hideKeyboard();
  await expect.poll(async () => (await invoke(page, 'load_workspace')).cases[0]?.title).toBe(title);
  await record('Native SQLite case creation');

  const status = page.getByRole('combobox', { name: '案件状态', exact: true });
  await status.click();
  await page.getByRole('option', { name: '#进行中', exact: true }).click();
  await expect(status).toHaveAttribute('data-value', 'in_progress');
  await hideKeyboard();
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.getByRole('button', { name: /记一笔收支/ })).toBeVisible();
  await back();
  await expect(page.getByRole('button', { name: /记一笔收支/ })).toHaveCount(0);
  await expect(page.getByLabel('案件名称', { exact: true })).toBeVisible();
  await record('Status persistence and Android Back dismisses popover');

  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: /记一笔收支/ }).click();
  await page.getByLabel('收支金额', { exact: true }).fill('88.50');
  await page.getByLabel('收支类别', { exact: true }).fill('交通费');
  await page.getByLabel('收支备注', { exact: true }).fill('Android 原生收支（虚构）');
  await page
    .getByRole('dialog', { name: '记一笔收支', exact: true })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await hideKeyboard();
  await expect(page.locator('.chronicle-entry')).toContainText('88.50');
  await record('Shared timeline and ledger through Android runtime');

  await page.getByRole('tab', { name: '材料', exact: true }).click();
  const materials = page.getByRole('region', { name: '案件材料' });
  await materials.getByRole('button', { name: '添加材料', exact: true }).click();
  await nativeWait({ pkg: /.*documentsui/ });
  await back();
  await expect(materials.getByRole('button', { name: '添加材料', exact: true })).toBeEnabled();
  await device.push(Buffer.from(evidence), `/sdcard/Download/${evidenceName}`);
  shell(
    'am',
    'broadcast',
    '-a',
    'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
    '-d',
    `file:///sdcard/Download/${evidenceName}`,
  );
  await materials.getByRole('button', { name: '添加材料', exact: true }).click();
  await chooseDownload(evidenceName, () =>
    expect(materials.getByRole('button', { name: evidenceName, exact: true })).toBeVisible(),
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await touch(materials.getByRole('button', { name: evidenceName, exact: true }));
  await expect(page.locator('.text-document-preview')).toContainText(evidence.trim());
  await back();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('案件名称', { exact: true })).toBeVisible();
  await record('SAF cancellation, scoped import and original preview');

  const footer = page.getByRole('navigation', { name: '案件快捷操作', exact: true });
  await expect
    .poll(async () =>
      footer.evaluate((el) =>
        Math.abs(el.getBoundingClientRect().bottom - window.visualViewport.height),
      ),
    )
    .toBeLessThanOrEqual(2);
  await page.getByLabel('案件名称', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => innerHeight)).toBeLessThan(700);
  expect(await page.evaluate(() => innerHeight)).toBeGreaterThan(300);
  await expect
    .poll(async () =>
      footer.evaluate(
        (el) => el.getBoundingClientRect().bottom <= window.visualViewport.height + 2,
      ),
    )
    .toBe(true);
  await expect(footer).toBeVisible();
  await expect(footer).toBeInViewport();
  await device.screenshot({ path: `${out}/keyboard.png` });
  await hideKeyboard();
  await back();
  await expect(page.locator('.case-card')).toContainText(title);
  await record('System insets, keyboard footer and Back to cases');

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
  await nativeWait({ pkg: /.*documentsui/ });
  await pickerCommit({ desc: 'Show roots' }, () =>
    nativeWait({ text: 'Downloads', res: 'android:id/title', pkg: /.*documentsui/ }),
  );
  // Android selectors forward RegExp.source but discard JavaScript flags.
  await pickerCommit({ text: 'Downloads', res: 'android:id/title' }, () =>
    nativeWait({ text: /^[Ss][Aa][Vv][Ee]$/, pkg: /.*documentsui/ }),
  );
  await pickerCommit({ text: /^[Ss][Aa][Vv][Ee]$/ }, () =>
    expect(page.getByRole('status').filter({ hasText: '已导出' })).toBeVisible(),
  );
  const exported = shell('ls', '/sdcard/Download')
    .split('\n')
    .find((name) => name.endsWith('.zip'));
  if (!exported) throw new Error('Exported backup missing');
  execFileSync('adb', ['pull', `/sdcard/Download/${exported}`, `${out}/backup.zip`]);
  await page.getByRole('button', { name: '从文件恢复', exact: true }).click();
  const restore = page.getByRole('dialog', { name: '恢复完整备份', exact: true });
  await chooseDownload(exported, () => expect(restore).toBeVisible());
  await expect(restore).toContainText('1 个案件、1 份文件');
  await restore.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '备份已恢复' })).toBeVisible();
  await record('SAF full ZIP export, validation and confirmed restore');

  // A new device client cannot retain a stale process's debugger discovery.
  await device.close();
  shell('am', 'force-stop', pkg);
  [device] = await android.devices();
  if (!device) throw new Error('SDK emulator disconnected during restart');
  device.setDefaultTimeout(20000);
  await start();
  await expect(page.getByRole('dialog', { name: '欢迎使用案笺', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await expect(page.locator('.case-card')).toContainText(title);
  await page.locator('.case-card').first().click();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  await touch(page.getByRole('button', { name: evidenceName, exact: true }));
  await expect(page.locator('.text-document-preview')).toContainText(evidence.trim());
  await record('Cold restart preserves SQLite and material bytes');
  expect(errors).toEqual([]);
} catch (error) {
  await device.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  writeFileSync(`${out}/failure.txt`, String(error.stack ?? error));
  if (page) {
    writeFileSync(`${out}/page.html`, await page.content().catch(() => ''));
    await page.screenshot({ path: `${out}/webview.png` }).catch(() => {});
    const layout = await page
      .evaluate(() => ({
        height: innerHeight,
        width: innerWidth,
        dpr: devicePixelRatio,
        viewport: {
          height: visualViewport.height,
          width: visualViewport.width,
          offsetTop: visualViewport.offsetTop,
          scale: visualViewport.scale,
        },
        dialogs: [...document.querySelectorAll('dialog')].map((el) => ({
          open: el.open,
          rect: el.getBoundingClientRect().toJSON(),
          display: getComputedStyle(el).display,
          position: getComputedStyle(el).position,
          visibility: getComputedStyle(el).visibility,
        })),
      }))
      .catch(() => null);
    writeFileSync(`${out}/layout.json`, JSON.stringify(layout, null, 2));
  }
  try {
    writeFileSync(`${out}/logcat.txt`, shell('logcat', '-d', '-t', '1200'));
  } catch {}
  throw error;
} finally {
  writeFileSync(
    `${out}/results.json`,
    JSON.stringify(
      {
        apkSource: process.env.ANDROID_APK_SOURCE_SHA ?? process.env.GITHUB_SHA,
        harnessSource: process.env.GITHUB_SHA,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  await device.close();
}
