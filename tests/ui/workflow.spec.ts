import { selectOption, openFlowDetails } from './fields';
import { expect, test, type Page } from '@playwright/test';

async function createCase(page: Page, title: string) {
  await page.getByRole('button', { name: '新建案件', exact: true }).click();
  await page.getByRole('textbox', { name: '案件名称', exact: true }).fill(title);
  await page.getByRole('textbox', { name: '案件名称', exact: true }).press('Enter');
  await expect(page.locator('.save-state')).toHaveText('已保存');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await expect(page.locator('.case-column')).toHaveCount(3);
});

test('侧页建案、待办、工作记录与可恢复删除', async ({ page }) => {
  await createCase(page, '浏览器流程验证案件');
  await page.getByRole('button', { name: '添加待办', exact: true }).click();
  await page.getByRole('textbox', { name: '待办内容' }).fill('核对证据目录');
  await page.getByRole('button', { name: '保存待办', exact: true }).click();
  await expect(page.locator('.work-task-row')).toContainText('核对证据目录');
  await page.getByRole('checkbox', { name: /核对证据目录/ }).click();
  await page.getByText(/已完成 ·/).click();
  await expect(page.getByRole('checkbox', { name: /核对证据目录/ })).toBeChecked();
  await page.getByRole('button', { name: '记录', exact: true }).click();
  await page.getByRole('textbox', { name: '工作记录内容' }).fill('已与当事人核对现有证据。');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(page.locator('.work-record')).toContainText('已与当事人核对现有证据。');
  await page.getByRole('button', { name: '删除案件', exact: true }).click();
  await page.getByRole('button', { name: '移入回收站', exact: true }).click();
  await expect(page.getByRole('region', { name: '案件详情' })).toHaveCount(0);
  await page.getByRole('button', { name: '回收站', exact: true }).click();
  await expect(page.locator('.trash-item')).toContainText('浏览器流程验证案件');
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await expect(page.locator('.trash-item')).toHaveCount(0);
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').filter({ hasText: '浏览器流程验证案件' }).click();
  await page.getByText(/已完成 ·/).click();
  await expect(page.getByRole('checkbox', { name: /核对证据目录/ })).toBeChecked();
  await expect(page.locator('.work-record')).toContainText('已与当事人核对现有证据。');
});

test('不同流程独立保存案号，新增流程不改变案件状态', async ({ page }) => {
  await createCase(page, '流程隔离测试');
  await expect(page.locator('.program-node')).toHaveCount(0);
  await page.getByRole('button', { name: '新增流程', exact: true }).click();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await openFlowDetails(page);
  await page.getByRole('tab', { name: '办理', exact: true }).click();
  await openFlowDetails(page);
  await page.getByRole('textbox', { name: '案号', exact: true }).fill('一审独立案号');
  await page.getByRole('textbox', { name: '案号', exact: true }).press('Tab');
  await expect(page.locator('.save-state')).toHaveText('已保存');
  await page.getByRole('button', { name: '新增流程', exact: true }).click();
  await selectOption(page, page.getByRole('combobox', { name: '流程模板' }), 'appeal');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await openFlowDetails(page);
  await expect(page.locator('.program-detail-heading h2')).toHaveText('二审');
  await expect(page.getByRole('textbox', { name: '案号', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: '查看一审流程', exact: true }).click();
  await openFlowDetails(page);
  await expect(page.getByRole('textbox', { name: '案号', exact: true })).toHaveValue(
    '一审独立案号',
  );
  await expect(page.getByRole('combobox', { name: '案件状态', exact: true })).toHaveAttribute(
    'data-value',
    'not_started',
  );
});

test('空白草稿关闭不留下案件，快速回车不重复创建', async ({ page }) => {
  await page.getByRole('button', { name: '新建案件', exact: true }).click();
  await page.getByRole('textbox', { name: '案件名称', exact: true }).fill('   ');
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await expect(page.locator('.case-count')).toHaveText('1 个案件');
  await page.getByRole('button', { name: '新建案件', exact: true }).click();
  const input = page.getByRole('textbox', { name: '案件名称', exact: true });
  await input.fill('一次建案');
  await input.press('Enter');
  await input.press('Enter');
  await expect(page.locator('.save-state')).toHaveText('已保存');
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await expect(page.locator('.case-card').filter({ hasText: '一次建案' })).toHaveCount(1);
});

test('手机宽度保持可读布局，案件侧页占满可用宽度', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.case-card').first().click();
  await expect(page.getByRole('textbox', { name: '案件名称', exact: true })).toBeVisible();
  const geometry = await page.locator('.case-page').boundingBox();
  expect(geometry?.width).toBe(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('浏览器普通入口不会伪装成本地数据库或自动写入示例', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('请通过桌面应用启动');
  await expect(page.locator('.case-card')).toHaveCount(0);
});
