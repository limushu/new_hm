import { expect, test } from '@playwright/test';
import { selectOption } from './fields';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('清单用日期栏标记今天，切换选择保留今天标记，已有导航可回今天', async ({ page }) => {
  await page.goto('/?preview=1');
  const strip = page.getByRole('navigation', { name: '本周日期', exact: true });
  const today = strip.locator('[aria-current="date"]');
  await expect(today).toHaveCount(1);
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  const label = await today.getAttribute('aria-label');
  await expect(page.locator('.calendar-header .calendar-navigation')).toHaveCount(0);
  await strip.locator('button:not([aria-current])').first().tap();
  await expect(today).toHaveAttribute('aria-label', label!);
  await expect(today).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('dialog[open], :popover-open')).toHaveCount(0);
  await page.locator('.sidebar nav').getByRole('button', { name: '今天', exact: true }).tap();
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('日历视图', { exact: true })).toContainText('清单');
});

test('浏览其他月份后，点击已有今天导航恢复本周，不新增日期入口', async ({ page }) => {
  await page.goto('/?preview=1');
  const label = await page
    .locator('.agenda-week-strip [aria-current="date"]')
    .getAttribute('aria-label');
  await selectOption(page, page.getByLabel('日历视图', { exact: true }), 'month');
  await page.getByRole('button', { name: '下个月', exact: true }).tap();
  await page.getByRole('button', { name: '下个月', exact: true }).tap();
  await selectOption(page, page.getByLabel('日历视图', { exact: true }), 'agenda');
  await expect(page.locator('.agenda-week-strip [aria-current="date"]')).toHaveCount(0);
  await page.locator('.sidebar nav').getByRole('button', { name: '今天', exact: true }).tap();
  await expect(page.getByRole('button', { name: label!, exact: true })).toHaveAttribute(
    'aria-current',
    'date',
  );
  await expect(page.getByRole('button', { name: label!, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.calendar-header .calendar-navigation')).toHaveCount(0);
  await expect(page.locator('dialog[open], :popover-open')).toHaveCount(0);
});
