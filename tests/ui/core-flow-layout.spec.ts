import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
const longTitle =
  '某科技公司与某贸易公司买卖合同纠纷、财产保全及相关款项争议案件（长名称阅读检查）';

test('案件长名称完整换行，状态标签、时间轴和同级操作在窄屏保持可读', async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await page.locator('.case-card').first().tap();
  await page.getByLabel('案件名称', { exact: true }).fill(longTitle);
  await page.getByRole('button', { name: '保存名称', exact: true }).tap();
  for (const width of [320, 390, 430, 760, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const title = page.getByLabel('案件名称', { exact: true });
    // ResizeObserver runs at the next rendering opportunity after a viewport
    // change. Verify the settled result rather than the preceding frame.
    await expect(async () => {
      const geometry = await title.evaluate((element: HTMLTextAreaElement) => ({
        height: element.clientHeight,
        content: element.scrollHeight,
        width: element.clientWidth,
        contentWidth: element.scrollWidth,
        font: parseFloat(getComputedStyle(element).fontSize),
      }));
      expect(geometry.content).toBeLessThanOrEqual(geometry.height + 1);
      expect(geometry.contentWidth).toBeLessThanOrEqual(geometry.width + 1);
      expect(geometry.font).toBeGreaterThanOrEqual(24);
    }).toPass({ timeout: 5000 });
    const pane = page.getByRole('region', { name: '案件详情', exact: true });
    expect(
      await pane.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await expect(page.getByRole('navigation', { name: '案件快捷操作' })).toBeInViewport();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '返回看板', exact: true }).tap();
  await expect(page.locator('.mobile-case-item')).toContainText(longTitle);
  await expect(page.locator('.mobile-case-item')).toContainText('进行中');
  await expect(page.locator('.mobile-case-item')).toContainText('核对当事人提供的材料');
});

test('短视口中正文可滚动，编辑页的关闭和保存始终可见，取消回到原对象', async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await page.locator('.case-card').first().tap();
  await page.locator('.chronicle-entry-title').first().tap();
  let details = page.getByRole('dialog', { name: '对象详情', exact: true });
  const original = await details.locator('.object-heading').innerText();
  await details.getByRole('button', { name: '编辑内容', exact: true }).tap();
  const editor = page.getByRole('dialog', { name: '编辑待办', exact: true });
  await expect(editor).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 420 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-top', '47px');
    document.documentElement.style.setProperty('--safe-bottom', '34px');
  });
  const sheet = page.locator('dialog[open]');
  await sheet.locator('.dialog-body').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const header = await sheet.locator('form > header').boundingBox();
  const footer = await sheet.locator('form > footer').boundingBox();
  const close = await sheet.getByRole('button', { name: '关闭', exact: true }).boundingBox();
  expect(header!.y).toBeGreaterThanOrEqual(47);
  expect(close!.y + close!.height).toBeLessThanOrEqual(420 - 34);
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(420);
  const save = await sheet.getByRole('button', { name: '保存待办', exact: true }).boundingBox();
  expect(save!.y + save!.height).toBeLessThanOrEqual(420 - 34);
  await sheet.getByRole('button', { name: '取消', exact: true }).tap();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  details = page.getByRole('dialog', { name: '对象详情', exact: true });
  await expect(details.locator('.object-heading')).toHaveText(original);
  await details.getByRole('button', { name: '关闭', exact: true }).tap();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('系统键盘缩小可见区域时，所有编辑浮层共用窗口尺寸并保留草稿', async ({ page }) => {
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: viewport });
  });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '新建日程', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: '新建日程', exact: true });
  await sheet.getByLabel('日程名称', { exact: true }).fill('键盘下的虚构开庭安排');
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 440 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  const header = await sheet.locator('form > header').boundingBox();
  const save = await sheet.getByRole('button', { name: '保存日程', exact: true }).boundingBox();
  expect(header!.y).toBeGreaterThanOrEqual(0);
  expect(save!.y + save!.height).toBeLessThanOrEqual(440);
  await expect(sheet.getByLabel('日程名称', { exact: true })).toHaveValue('键盘下的虚构开庭安排');
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 844 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await sheet.getByRole('button', { name: '保存日程', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: /键盘下的虚构开庭安排/ })).toBeVisible();
});
