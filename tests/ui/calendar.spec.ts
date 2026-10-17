import { expect, test, type Page } from '@playwright/test';

async function openDay(page: Page, date: string) {
  await page.getByRole('button', { name: `在 ${date} 新建日程`, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function saveEvent(page: Page, title: string) {
  await page.getByRole('textbox', { name: '日程名称', exact: true }).fill(title);
  await page.getByRole('button', { name: '保存日程', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/?preview=1');
  await expect(page.getByRole('button', { name: '新建日程', exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: '日历视图', exact: true }).selectOption('month');
});

test('日期格直接新建个人日程，修改时间和备注，再删除', async ({ page }) => {
  const date = await page.locator('.calendar-day.selected').getAttribute('data-date');
  await openDay(page, date!);
  await expect(page.getByLabel('开始日期', { exact: true })).toHaveValue(date!);
  await page.getByLabel('日程名称', { exact: true }).fill('个人阅读时间');
  await page.getByLabel('开始时间', { exact: true }).fill('14:00');
  await page.getByLabel('结束时间', { exact: true }).fill('13:00');
  await page.getByRole('button', { name: '保存日程', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('结束时间必须晚于开始时间');
  await page.getByLabel('结束时间', { exact: true }).fill('15:00');
  await page.getByLabel('地点', { exact: true }).fill('图书馆');
  await page.getByLabel('日程备注', { exact: true }).fill('读完一章');
  await saveEvent(page, '个人阅读时间');
  await expect(page.locator('.calendar-entry').filter({ hasText: '个人阅读时间' })).toContainText(
    '14:00',
  );
  await expect(page.getByRole('region', { name: '当天安排' })).toContainText('图书馆');
  await page.locator('.calendar-entry').filter({ hasText: '个人阅读时间' }).click();
  await expect(page.getByLabel('日程备注', { exact: true })).toHaveValue('读完一章');
  await page.getByLabel('开始时间', { exact: true }).fill('16:00');
  await page.getByLabel('结束时间', { exact: true }).fill('17:00');
  await saveEvent(page, '修改后的阅读时间');
  await expect(
    page.locator('.calendar-entry').filter({ hasText: '修改后的阅读时间' }),
  ).toContainText('16:00');
  await page.locator('.calendar-entry').filter({ hasText: '修改后的阅读时间' }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.locator('.calendar-entry').filter({ hasText: '修改后的阅读时间' })).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.calendar-entry').filter({ hasText: '修改后的阅读时间' })).toHaveCount(
    0,
  );
});

test('全天跨月日期连续呈现，切月后的新建使用选中日期', async ({ page }) => {
  await page.getByRole('button', { name: '新建日程', exact: true }).click();
  await page.getByRole('checkbox', { name: '全天日程' }).check();
  await expect(page.getByLabel('开始时间', { exact: true })).toHaveCount(0);
  await page.getByLabel('开始日期', { exact: true }).fill('2026-10-31');
  await page.getByLabel('结束日期', { exact: true }).fill('2026-11-02');
  await saveEvent(page, '跨月准备材料');
  await page.getByRole('button', { name: '下个月', exact: true }).click();
  for (const date of ['2026-11-01', '2026-11-02']) {
    await expect(page.locator(`[data-date="${date}"] .all-day`)).toContainText('跨月准备材料');
  }
  await expect(page.locator('[data-date="2026-11-03"] .all-day')).toHaveCount(0);
  await page.getByRole('button', { name: '新建日程', exact: true }).click();
  await expect(page.getByLabel('开始日期', { exact: true })).toHaveValue('2026-11-01');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('日程与待办分别筛选，关联案件跳转并随案件回收和恢复', async ({ page }) => {
  const date = await page.locator('.calendar-day.selected').getAttribute('data-date');
  await openDay(page, date!);
  await page.getByRole('button', { name: '关联案件', exact: true }).click();
  await page.getByRole('button', { name: '关联 张某与李某借款纠纷（示例）', exact: true }).click();
  await saveEvent(page, '案件会见安排');
  await page.getByRole('button', { name: '日程', exact: true }).click();
  await expect(page.locator('.task-entry')).toHaveCount(0);
  await expect(page.locator('.event-entry')).toHaveCount(1);
  await page.getByRole('button', { name: '待办', exact: true }).click();
  await expect(page.locator('.event-entry')).toHaveCount(0);
  await expect(page.locator('.task-entry')).toHaveCount(1);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page
    .getByRole('region', { name: '当天安排' })
    .locator('.agenda-event .agenda-case-link')
    .click();
  await expect(page.getByRole('textbox', { name: '案件名称', exact: true })).toHaveValue(
    '张某与李某借款纠纷（示例）',
  );
  await page.getByRole('button', { name: '案件操作', exact: true }).click();
  await page.getByRole('button', { name: '移入回收站', exact: true }).click();
  await expect(page.locator('.event-entry')).toHaveCount(0);
  await page.getByRole('button', { name: '回收站', exact: true }).click();
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByRole('button', { name: '今天', exact: true }).first().click();
  await expect(page.locator('.event-entry')).toHaveCount(1);
});

test('多项日程折叠，全天优先并按时间排列，取消不会创建', async ({ page }) => {
  const date = await page.locator('.calendar-day.selected').getAttribute('data-date');
  for (const [title, start, end] of [
    ['下午安排', '14:00', '15:00'],
    ['上午安排', '08:00', '09:00'],
    ['傍晚安排', '17:00', '18:00'],
  ]) {
    await openDay(page, date!);
    await page.getByLabel('开始时间', { exact: true }).fill(start);
    await page.getByLabel('结束时间', { exact: true }).fill(end);
    await saveEvent(page, title);
  }
  await openDay(page, date!);
  await page.getByRole('checkbox', { name: '全天日程' }).check();
  await saveEvent(page, '全天安排');
  const day = page.locator(`[data-date="${date}"]`);
  await expect(day.locator('.event-entry')).toHaveCount(3);
  await expect(day.getByRole('button', { name: '还有 2 项' })).toBeVisible();
  await day.getByRole('button', { name: '还有 2 项' }).click();
  await expect(page.getByRole('region', { name: '当天安排' })).toBeInViewport();
  await expect(page.locator('.agenda-event-main strong')).toHaveText([
    '全天安排',
    '上午安排',
    '下午安排',
    '傍晚安排',
  ]);
  await day.dblclick({ position: { x: 10, y: 100 } });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('日程名称', { exact: true }).fill('取消的草稿');
  await page.keyboard.press('Escape');
  await expect(page.locator('.agenda-event-main strong')).toHaveCount(4);
});

test('手机月历与编辑器不横向溢出，可直接保存日程', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '新建日程', exact: true }).click();
  const box = await page.getByRole('dialog').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await saveEvent(page, '手机新建日程');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('.event-entry')).toContainText('手机新建日程');
});
