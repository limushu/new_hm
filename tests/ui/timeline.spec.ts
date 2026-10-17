import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?preview=1');
  await expect(page.getByRole('combobox', { name: '日历视图' })).toHaveValue('week');
});

test('默认周时间表，小月历跳转，空闲时间可创建且不自动关联案件', async ({ page }) => {
  const date = await page.locator('.mini-month [aria-pressed="true"]').getAttribute('aria-label');
  const key = date!.replace('跳转到 ', '');
  await page.getByRole('button', { name: `在 ${key} 09:30 新建日程`, exact: true }).click();
  await expect(page.getByLabel('开始时间', { exact: true })).toHaveValue('09:30');
  await expect(page.getByLabel('结束时间', { exact: true })).toHaveValue('10:00');
  await expect(page.getByRole('button', { name: '关联案件', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '日程名称' }).fill('自由安排');
  await page.getByRole('button', { name: '关联案件', exact: true }).click();
  await page.getByRole('button', { name: '关联 张某与李某借款纠纷（示例）', exact: true }).click();
  await page.getByRole('button', { name: '保存日程', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.time-event')).toContainText('自由安排');
  await page.getByRole('button', { name: `在 ${key} 11:00 新建日程`, exact: true }).click();
  await expect(page.getByRole('button', { name: '关联案件', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '日程名称' }).fill('不关联任何案件');
  await page.getByRole('button', { name: '保存日程', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.mouse.move(220, 25);
  const cardStyles = await page.locator('.time-event').evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        color: style.color,
        border: style.borderLeftColor,
        radius: style.borderRadius,
        titleSize: getComputedStyle(element.querySelector('strong')!).fontSize,
      };
    }),
  );
  expect(cardStyles).toHaveLength(2);
  expect(cardStyles[0]).toEqual(cardStyles[1]);
  await page.locator('.time-event').filter({ hasText: '自由安排' }).click();
  await page.getByRole('button', { name: '取消关联案件', exact: true }).click();
  await page.getByRole('button', { name: '保存日程', exact: true }).click();
  await expect(page.locator('.time-event.personal-event')).toHaveCount(2);
  await page.getByRole('button', { name: '下一周', exact: true }).click();
  await expect(page.locator('.time-event')).toHaveCount(0);
  await page.getByRole('button', { name: `跳转到 ${key}`, exact: true }).click();
  await expect(page.locator('.time-event')).toHaveCount(2);
  await page.getByRole('combobox', { name: '日历视图' }).selectOption('day');
  await expect(page.locator('.time-column')).toHaveCount(1);
});

test('重叠时间块并排展示，全天与待办不放入小时网格', async ({ page }) => {
  const key = (await page
    .locator('.mini-month [aria-pressed="true"]')
    .getAttribute('aria-label'))!.replace('跳转到 ', '');
  for (const [title, start] of [
    ['安排一', '09:00'],
    ['安排二', '09:30'],
  ]) {
    await page.getByRole('button', { name: '新建日程', exact: true }).click();
    await page.getByLabel('开始时间', { exact: true }).fill(start);
    await page.getByLabel('结束时间', { exact: true }).fill(start === '09:00' ? '10:00' : '10:30');
    await page.getByRole('textbox', { name: '日程名称' }).fill(title);
    await page.getByRole('button', { name: '保存日程', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await expect(page.locator('.time-event[data-lanes="2"]')).toHaveCount(2);
  const boxes = await page.locator('.time-event').evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right };
    }),
  );
  expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].left);
  await expect(page.locator('.all-day-grid .time-task')).toContainText('核对当事人提供的材料');
  await page.getByRole('button', { name: `在 ${key} 添加全天日程`, exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '全天日程' })).toBeChecked();
  await page.getByRole('textbox', { name: '日程名称' }).fill('全天准备');
  await page.getByRole('button', { name: '保存日程', exact: true }).click();
  await expect(page.locator('.time-all-day')).toHaveText('全天准备');
});

test('手机默认日视图，切周视图仅在时间表内部横向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('combobox', { name: '日历视图' })).toHaveValue('day');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('combobox', { name: '日历视图' }).selectOption('week');
  await expect(page.locator('.time-column')).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('当前时间线按分钟更新，仅出现在今天，并可通过今天按钮重新定位', async ({ page }) => {
  const time = await page.evaluate(() => new Date(2026, 9, 17, 13, 15).getTime());
  await page.clock.install({ time });
  await page.reload();
  const line = page.getByLabel('当前时间 13:15', { exact: true });
  await expect(line).toBeInViewport();
  await expect(line).toHaveCSS('top', '795px');
  await expect(page.locator('.time-now-label')).toHaveText('13:15');
  await page.clock.fastForward(60_100);
  await expect(page.getByLabel('当前时间 13:16', { exact: true })).toHaveCSS('top', '796px');
  await page.locator('.time-scroll').evaluate((element) => (element.scrollTop = 0));
  await expect(page.getByLabel('当前时间 13:16', { exact: true })).not.toBeInViewport();
  await page.locator('.calendar-today').click();
  await expect(page.getByLabel('当前时间 13:16', { exact: true })).toBeInViewport();
  await page.getByRole('button', { name: '下一周', exact: true }).click();
  await expect(page.locator('.current-time-line')).toHaveCount(0);
  await page.locator('.calendar-today').click();
  const afterMidnight = await page.evaluate(() => new Date(2026, 9, 18, 0, 1).getTime());
  await page.clock.setSystemTime(afterMidnight);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('[data-time-date="2026-10-18"] .current-time-line')).toHaveAttribute(
    'aria-label',
    '当前时间 00:01',
  );
  await page.locator('.calendar-today').click();
  await expect(page.locator('.mini-month [aria-pressed="true"]')).toHaveAttribute(
    'aria-label',
    '跳转到 2026-10-18',
  );
});

test('加号关联入口支持搜索、取消选择和清除关联，不改变草稿内容', async ({ page }) => {
  await page.getByRole('button', { name: '新建日程', exact: true }).click();
  await page.getByLabel('日程名称', { exact: true }).fill('关联自主选择');
  await expect(page.getByRole('combobox', { name: '关联案件' })).toHaveCount(0);
  await page.getByRole('button', { name: '关联案件', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索关联案件' }).fill('不存在的案件');
  await expect(page.getByRole('group', { name: '选择关联案件' })).toContainText('没有匹配的案件');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('group', { name: '选择关联案件' })).toHaveCount(0);
  await page.getByRole('button', { name: '关联案件', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索关联案件' }).fill('借款');
  await page.getByRole('textbox', { name: '搜索关联案件' }).press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('button', { name: '关联 张某与李某借款纠纷（示例）', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '更换关联案件' })).toContainText('借款纠纷');
  await page.getByRole('button', { name: '取消关联案件', exact: true }).click();
  await expect(page.getByRole('button', { name: '关联案件', exact: true })).toBeVisible();
  await expect(page.getByLabel('日程名称', { exact: true })).toHaveValue('关联自主选择');
});
