import { openFinanceDetails } from './fields';
import { expect, test } from '@playwright/test';
import { selectOption } from './fields';
test.beforeEach(async ({ page }) => {
  await page.goto('/?preview=1');
});
test('浅色覆盖页面与弹层，偏好刷新后保留，跟随系统可随系统变化', async ({ page }) => {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  await page.getByLabel('筛选对象类型').click();
  await expect(page.getByRole('listbox')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '跟随系统', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
test('四个主标签同字号同字重，键盘切换，滚动时入口仍可见', async ({ page }) => {
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').click();
  const tabs = page.getByRole('tablist', { name: '案件功能' });
  await expect(tabs.getByRole('tab')).toHaveCount(4);
  const fonts = await tabs.getByRole('tab').evaluateAll((nodes) =>
    nodes.map((n) => ({
      size: getComputedStyle(n).fontSize,
      weight: getComputedStyle(n).fontWeight,
      family: getComputedStyle(n).fontFamily,
    })),
  );
  expect(new Set(fonts.map((f) => JSON.stringify(f))).size).toBe(1);
  await page.getByRole('tab', { name: '脉络', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: '费用', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.proceeding-path')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: '人员', exact: true })).toBeFocused();
  await page.getByRole('tab', { name: '脉络', exact: true }).click();
  await page.locator('.case-page').evaluate((e) => (e.scrollTop = e.scrollHeight));
  await expect(page.getByRole('tab', { name: '材料', exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('记账直接上传凭据，取消不导入，保存后材料与金额一起出现', async ({ page }) => {
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').click();
  await page.getByRole('tab', { name: '费用', exact: true }).click();
  await openFinanceDetails(page);
  const file = {
    name: '报销凭据.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('fictional receipt'),
  };
  await page.getByRole('button', { name: '记一笔', exact: true }).click();
  await page.getByLabel('上传报销凭据文件').setInputFiles(file);
  await expect(page.locator('.receipt-selected')).toContainText(file.name);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  await expect(page.locator('.material-row')).toHaveCount(0);
  await page.getByRole('tab', { name: '费用', exact: true }).click();
  await openFinanceDetails(page);
  await page.getByRole('button', { name: '记一笔', exact: true }).click();
  await selectOption(page, page.getByLabel('收支类型'), 'expense');
  await page.getByLabel('收支金额').fill('128.50');
  await page.getByLabel('上传报销凭据文件').setInputFiles(file);
  await selectOption(page, page.getByLabel('报销状态'), 'pending');
  await page
    .getByRole('dialog', { name: '记一笔收支', exact: true })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(page.locator('.ledger-row')).toContainText('128.50');
  await expect(page.locator('.ledger-row')).toContainText('待报销');
  await expect(
    page.locator('.ledger-row').getByRole('button', { name: '凭证', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  await expect(page.locator('.material-row')).toHaveCount(1);
  await expect(page.locator('.material-row')).toContainText(file.name);
});

test('绿色强调色随深浅主题派生，各页面主按钮一致且文字保持可读', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const palette = () =>
    page.evaluate(() => {
      const node = document.createElement('i');
      document.body.append(node);
      const read = (token: string) => {
        node.style.color = `var(--${token})`;
        return getComputedStyle(node).color;
      };
      const result = {
        fill: read('primary'),
        hover: read('primary-hover'),
        onFill: read('on-primary'),
        text: read('blue-text'),
        soft: read('blue-soft'),
        surface: read('surface'),
        calendar: read('calendar-card'),
        edge: read('calendar-card-edge'),
      };
      node.remove();
      return result;
    });
  const luminance = (color: string) => {
    const rgb = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((n) => {
        const value = n / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const contrast = (a: string, b: string) => {
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const colors = new Map<string, Awaited<ReturnType<typeof palette>>>();
  for (const [theme, label] of [
    ['light', '浅色'],
    ['dark', '深色'],
  ] as const) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const tones = await palette();
    colors.set(theme, tones);
    for (const background of [tones.fill, tones.hover])
      expect(contrast(tones.onFill, background)).toBeGreaterThanOrEqual(4.5);
    for (const background of [tones.surface, tones.soft])
      expect(contrast(tones.text, background)).toBeGreaterThanOrEqual(4.5);
    expect(tones.calendar).toBe(tones.soft);
    expect(tones.edge).toBe(tones.text);
    await page.getByRole('button', { name: '今天', exact: true }).click();
    await expect(page.getByRole('button', { name: '新建日程', exact: true })).toHaveCSS(
      'background-color',
      tones.fill,
    );
    await expect(page.getByRole('button', { name: '新建日程', exact: true })).toHaveCSS(
      'color',
      tones.onFill,
    );
    await page.getByRole('button', { name: '案件', exact: true }).click();
    await expect(page.locator('.mobile-create-case')).toHaveCSS('background-color', tones.fill);
    await expect(page.locator('.mobile-create-case')).toHaveCSS('color', tones.onFill);
  }
  expect(colors.get('dark')!.fill).not.toBe(colors.get('light')!.fill);
  expect(colors.get('dark')!.text).not.toBe(colors.get('light')!.text);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '跟随系统', exact: true }).click();
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await palette()).toEqual(colors.get(theme));
  }
});
