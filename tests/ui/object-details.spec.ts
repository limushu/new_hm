import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { selectOption } from './fields';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
const audioName = '虚构会谈录音.wav';
const documentName = '会谈摘要.txt';
function wav() {
  const rate = 16000,
    bytes = rate * 2 * 4;
  const result = Buffer.alloc(44 + bytes);
  result.write('RIFF');
  result.writeUInt32LE(36 + bytes, 4);
  result.write('WAVEfmt ', 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(1, 22);
  result.writeUInt32LE(rate, 24);
  result.writeUInt32LE(rate * 2, 28);
  result.writeUInt16LE(2, 32);
  result.writeUInt16LE(16, 34);
  result.write('data', 36);
  result.writeUInt32LE(bytes, 40);
  return result;
}
async function prepare(page: Page) {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await page.locator('.case-card').first().tap();
  await page.getByRole('tab', { name: '材料', exact: true }).tap();
  await page.getByLabel('选择材料文件').setInputFiles([
    { name: audioName, mimeType: 'audio/wav', buffer: wav() },
    {
      name: documentName,
      mimeType: 'text/plain',
      buffer: Buffer.from('虚构会谈摘要，核对付款记录。'),
    },
  ]);
  await expect(page.locator('.material-row')).toHaveCount(2);
  await page.getByRole('tab', { name: '脉络', exact: true }).tap();
}
const openDialogs = (page: Page) => page.locator('dialog[open]');
const entry = (page: Page, title: string) =>
  page
    .locator('.chronicle-entry')
    .filter({ has: page.locator('.chronicle-entry-title', { hasText: title }) });

test('录音在同一详情内播放，信息保存取消统一，关闭直接回时间轴', async ({ page }) => {
  await prepare(page);
  await entry(page, audioName).locator('.chronicle-entry-title').tap();
  const detail = page.getByRole('dialog', { name: '对象详情', exact: true });
  await expect(openDialogs(page)).toHaveCount(1);
  await expect(detail.locator('audio')).toBeVisible();
  await expect(detail.locator('audio')).toHaveAttribute('controls', '');
  await detail.getByRole('button', { name: '添加属性', exact: true }).tap();
  const property = page.getByRole('dialog', { name: '添加属性', exact: true });
  await property.getByLabel('属性名称', { exact: true }).fill('会谈地点');
  await property.getByLabel('属性值', { exact: true }).fill('虚构会议室');
  await property.getByRole('button', { name: '保存属性', exact: true }).tap();
  expect(await detail.locator('audio').evaluate((node: HTMLAudioElement) => node.autoplay)).toBe(
    false,
  );
  await expect(page.locator('.material-preview')).toHaveCount(0);
  await detail.locator('audio').evaluate(async (node: HTMLAudioElement) => {
    Object.assign(window, { detailAudio: node });
    await node.play();
  });
  await expect
    .poll(() => detail.locator('audio').evaluate((node: HTMLAudioElement) => node.paused))
    .toBe(false);
  await detail.getByRole('button', { name: '编辑信息', exact: true }).tap();
  expect(
    await page.evaluate(
      () => (window as unknown as { detailAudio: HTMLAudioElement }).detailAudio.paused,
    ),
  ).toBe(true);
  await expect(openDialogs(page)).toHaveCount(1);
  await detail.getByLabel('对象标签', { exact: true }).fill('不应保存');
  await detail.getByRole('button', { name: '取消', exact: true }).tap();
  await expect(detail).not.toContainText('#不应保存');
  await detail.getByRole('button', { name: '编辑信息', exact: true }).tap();
  await detail.getByLabel('对象标签', { exact: true }).fill('会谈，关键');
  await detail.getByRole('checkbox', { name: '标为重要', exact: true }).check();
  await detail.getByRole('button', { name: '保存信息', exact: true }).tap();
  await expect(detail).toContainText('#会谈');
  await expect(detail.locator('.object-property-row')).toContainText('虚构会议室');
  await expect(detail.locator('audio')).toBeVisible();
  await expect(openDialogs(page)).toHaveCount(1);
  await expect
    .poll(() => detail.locator('audio').evaluate((node: HTMLAudioElement) => node.duration))
    .toBeGreaterThan(0);
  mkdirSync('artifacts/object-detail', { recursive: true });
  await page.screenshot({ path: 'artifacts/object-detail/recording-dark.png' });
  await detail.getByRole('button', { name: '关闭', exact: true }).tap();
  await expect(openDialogs(page)).toHaveCount(0);
  await entry(page, audioName)
    .getByRole('button', { name: `条目操作 ${audioName}`, exact: true })
    .tap();
  await expect(page.getByRole('menu', { name: '对象操作', exact: true })).toBeVisible();
  await expect(openDialogs(page)).toHaveCount(0);
  await page.getByRole('menuitem', { name: '查看详情', exact: true }).tap();
  await expect(detail).toContainText('#关键');
  await expect(detail.getByRole('button', { name: '取消重要标记', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('正文内嵌预览，只有明确全屏操作切换页面，返回不叠加详情', async ({ page }) => {
  await prepare(page);
  await entry(page, documentName).locator('.chronicle-entry-title').tap();
  const detail = page.getByRole('dialog', { name: '对象详情', exact: true });
  await expect(detail.locator('.text-document-preview')).toContainText('虚构会谈摘要');
  await expect(openDialogs(page)).toHaveCount(1);
  await detail.getByRole('button', { name: '全屏预览', exact: true }).tap();
  await expect(
    page.getByRole('dialog', { name: `预览 ${documentName}`, exact: true }),
  ).toBeVisible();
  await expect(openDialogs(page)).toHaveCount(1);
  await page.getByRole('button', { name: '返回详情', exact: true }).tap();
  await expect(detail.locator('.text-document-preview')).toContainText('核对付款记录');
  await expect(openDialogs(page)).toHaveCount(1);
  await detail.getByRole('button', { name: '关闭', exact: true }).tap();
  await expect(openDialogs(page)).toHaveCount(0);
});

test('关联导航复用当前详情，返回录音时不自动打开其他弹层', async ({ page }) => {
  await prepare(page);
  await entry(page, audioName).locator('.chronicle-entry-title').tap();
  const detail = page.getByRole('dialog', { name: '对象详情', exact: true });
  await detail.getByRole('button', { name: '添加关联', exact: true }).tap();
  const relation = page.getByRole('dialog', { name: '添加案件关联', exact: true });
  await selectOption(page, relation.getByLabel('关联对象类型', { exact: true }), 'document');
  await relation.getByRole('checkbox', { name: `选择 ${documentName}`, exact: true }).check();
  await relation.getByRole('button', { name: '保存关联', exact: true }).tap();
  await detail.locator('.resource-related-object').filter({ hasText: documentName }).tap();
  await expect(detail.locator('.text-document-preview')).toContainText('虚构会谈摘要');
  await expect(detail.locator('audio')).toHaveCount(0);
  await expect(openDialogs(page)).toHaveCount(1);
  await detail.getByRole('button', { name: '返回上一对象', exact: true }).tap();
  await expect(detail.locator('audio')).toBeVisible();
  await expect(detail.locator('h3').first()).toHaveText(audioName);
  await expect(openDialogs(page)).toHaveCount(1);
});

test('操作菜单编辑信息复用详情，回收需要明确确认', async ({ page }) => {
  await prepare(page);
  await entry(page, audioName)
    .getByRole('button', { name: `条目操作 ${audioName}`, exact: true })
    .tap();
  await page.getByRole('menuitem', { name: '编辑信息', exact: true }).tap();
  const detail = page.getByRole('dialog', { name: '对象详情', exact: true });
  await expect(detail.getByLabel('对象标签', { exact: true })).toBeVisible();
  await expect(openDialogs(page)).toHaveCount(1);
  await detail.getByRole('button', { name: '取消', exact: true }).tap();
  await expect(detail.locator('audio')).toBeVisible();
  await detail.getByRole('button', { name: '对象操作', exact: true }).tap();
  await page.getByRole('menuitem', { name: '移至回收站', exact: true }).tap();
  const confirm = page.getByRole('dialog', { name: '移至回收站？', exact: true });
  await confirm.getByRole('button', { name: '取消', exact: true }).tap();
  await expect(detail.locator('audio')).toBeVisible();
  await detail.getByRole('button', { name: '对象操作', exact: true }).tap();
  await page.getByRole('menuitem', { name: '移至回收站', exact: true }).tap();
  await confirm.getByRole('button', { name: '移至回收站', exact: true }).tap();
  await expect(openDialogs(page)).toHaveCount(0);
  await expect(entry(page, audioName)).toHaveCount(0);
  await expect(entry(page, documentName)).toHaveCount(1);
});
