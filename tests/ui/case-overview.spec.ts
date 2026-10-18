import { expect, test, type Page } from '@playwright/test';
import { selectOption } from './fields';

const node = (page: Page, title: string) =>
  page.getByRole('button', { name: `查看${title}程序`, exact: true });
const path = (page: Page) => page.getByRole('region', { name: '案件办理路径' });
async function add(page: Page, kind: string, parent: string) {
  await page.getByRole('button', { name: '新增程序', exact: true }).click();
  await selectOption(page, page.getByLabel('新增程序类型'), kind);
  await selectOption(page, page.getByLabel('新程序的前序程序'), { label: parent });
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
});

test('并行程序、明确前序与关注独立于浏览，办结不关闭整个案件', async ({ page }) => {
  await add(page, 'appeal', '一审');
  await add(page, 'enforcement', '一审');
  await expect(page.locator('.program-node')).toHaveCount(3);
  await expect(page.locator('.program-edges path')).toHaveCount(2);
  await expect(path(page)).toContainText('3 个办理中 · 当前关注：执行');
  await node(page, '一审').click();
  await expect(path(page)).toContainText('当前关注：执行');
  await page.getByRole('button', { name: '设为当前关注', exact: true }).click();
  await expect(path(page)).toContainText('当前关注：一审');
  await page.getByRole('button', { name: '举证', exact: true }).click();
  await expect(node(page, '一审')).toContainText('举证');
  await expect(page.locator('.stage-history-list')).toBeHidden();
  await node(page, '执行').click();
  await expect(page.locator('.stage-current')).toContainText('申请执行');
  await node(page, '一审').click();
  await selectOption(page, page.getByLabel('前序程序', { exact: true }), { label: '二审' });
  await expect(page.getByRole('alert')).toContainText('循环');
  await expect(page.getByLabel('前序程序', { exact: true })).toHaveAttribute('data-value', '');
  await page.getByRole('button', { name: '标记办结', exact: true }).click();
  await page
    .getByRole('dialog', { name: '办结程序' })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(path(page)).toContainText('2 个办理中 · 尚未指定当前关注');
  await expect(node(page, '一审')).toContainText('已办结');
  await expect(page.getByRole('button', { name: '管理阶段', exact: true })).toBeDisabled();
  await expect(page.getByLabel('案件状态', { exact: true })).toHaveAttribute(
    'data-value',
    'in_progress',
  );
  await page.getByRole('button', { name: '恢复办理', exact: true }).click();
  await page
    .getByRole('dialog', { name: '恢复程序办理' })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(path(page)).toContainText('3 个办理中 · 尚未指定当前关注');
});

test('案件标签可复用，键盘选择已有标签并保存到另一案件', async ({ page }) => {
  const tags = page.getByRole('combobox', { name: '案件标签', exact: true });
  await tags.fill('#合同纠纷');
  await tags.press('Enter');
  await expect(page.getByRole('button', { name: '移除标签合同纠纷' })).toBeVisible();
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await expect(page.locator('.case-card')).toContainText('#合同纠纷');
  await page.getByRole('button', { name: '新建案件', exact: true }).click();
  await page.getByLabel('案件名称', { exact: true }).fill('标签复用验收');
  await page.getByLabel('案件名称', { exact: true }).press('Enter');
  await tags.fill('合同');
  await expect(page.getByRole('option', { name: '#合同纠纷', exact: true })).toBeVisible();
  await tags.press('ArrowDown');
  await tags.press('Enter');
  await expect(page.getByRole('button', { name: '移除标签合同纠纷' })).toBeVisible();
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.locator('.case-card').filter({ hasText: '标签复用验收' }).click();
  await expect(page.getByRole('button', { name: '移除标签合同纠纷' })).toBeVisible();
});

test('日历关联事件在案件出现，案件修改同一日程并同步回日历', async ({ page }) => {
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await page.getByRole('button', { name: '新建日程', exact: true }).click();
  await page.getByLabel('日程名称', { exact: true }).fill('证据核对会议');
  await page.getByRole('button', { name: '关联案件', exact: true }).click();
  await page.getByRole('button', { name: '关联 张某与李某借款纠纷（示例）', exact: true }).click();
  await page.getByRole('button', { name: '保存日程', exact: true }).click();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.locator('.case-schedule-row').filter({ hasText: '证据核对会议' }).click();
  await page.getByLabel('日程名称', { exact: true }).fill('证据核对会议（已调整）');
  await page.getByRole('button', { name: '保存日程', exact: true }).click();
  await expect(page.locator('.case-schedule-row')).toHaveCount(1);
  await expect(page.locator('.case-schedule-row')).toContainText('已调整');
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await expect(page.locator('.time-event')).toHaveCount(1);
  await expect(page.locator('.time-event')).toContainText('已调整');
});

test('程序材料入口直达目标，窄屏节点滚动不撑开页面', async ({ page }) => {
  await add(page, 'enforcement', '一审');
  await page.getByRole('button', { name: '概览', exact: true }).click();
  await page.locator('.overview-materials button').filter({ hasText: '执行' }).click();
  await expect(page.locator('.materials-scope')).toContainText('执行');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('navigation', { name: '按程序查看材料' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(
    page.getByRole('navigation', { name: '按程序查看材料' }).getByRole('button', { name: /^执行/ }),
  ).toBeVisible();
});

test('收支图按整数分统计、分类筛选不改变总额，超收明确显示', async ({ page }) => {
  await page.getByRole('button', { name: '收支', exact: true }).click();
  await expect(page.getByRole('img', { name: '收入分类，总额 0.00 元' })).toBeVisible();
  await page.getByRole('button', { name: '修改约定', exact: true }).click();
  await page.getByRole('textbox', { name: '约定律师费', exact: true }).fill('1000');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  for (const [category, amount] of [
    ['律师费', '1200.01'],
    ['咨询费', '399.99'],
  ]) {
    await page.getByRole('button', { name: '记一笔', exact: true }).click();
    await page.getByLabel('收支金额', { exact: true }).fill(amount);
    await page.getByLabel('收支类别', { exact: true }).fill(category);
    await page.getByRole('button', { name: '保存', exact: true }).click();
  }
  await expect(page.getByRole('img', { name: '收入分类，总额 1,600.00 元' })).toBeVisible();
  await expect(page.locator('.fee-progress')).toContainText('超出约定 ¥ 200.01');
  await page.locator('.chart-legend button').filter({ hasText: '咨询费' }).click();
  await expect(page.locator('.ledger-row')).toHaveCount(1);
  await expect(page.locator('.ledger-row')).toContainText('399.99');
  await expect(page.getByRole('img', { name: '收入分类，总额 1,600.00 元' })).toBeVisible();
  await page.getByRole('button', { name: /清除分类筛选/ }).click();
  await expect(page.locator('.ledger-row')).toHaveCount(2);
});

test('中间阶段完成后可重开，保留后续完成状态、当前阶段与历史', async ({ page }) => {
  await page.getByRole('button', { name: '程序详情', exact: true }).click();
  await page.getByRole('button', { name: '举证', exact: true }).click();
  await expect(page.locator('.stage-done')).toHaveCount(0);
  await page.getByRole('button', { name: '管理阶段', exact: true }).click();
  for (const name of ['立案', '裁判']) {
    await page.getByRole('button', { name: `调整${name}状态`, exact: true }).click();
    await selectOption(page, page.getByRole('combobox', { name: '阶段状态', exact: true }), 'done');
    await page.getByRole('button', { name: '应用', exact: true }).click();
  }
  const manager = page.getByRole('dialog', { name: '管理办理阶段', exact: true });
  await manager.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.getByRole('button', { name: '立案', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '阶段状态', exact: true })).toHaveAttribute(
    'data-value',
    'pending',
  );
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.getByRole('button', { name: '立案', exact: true })).toHaveClass(
    /stage-pending/,
  );
  await expect(page.getByRole('button', { name: '裁判', exact: true })).toHaveClass(/stage-done/);
  await expect(page.getByRole('button', { name: '举证', exact: true })).toHaveClass(
    /stage-current/,
  );
  await page.getByText(/阶段变更记录 ·/).click();
  await expect(page.locator('.stage-history-list')).toContainText('完成阶段：立案');
  await expect(page.locator('.stage-history-list')).toContainText('重新打开阶段：立案');
  await expect(page.locator('.stage-history-list')).toContainText('已完成 → 待办理');
});
