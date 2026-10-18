import { expect, test, type Page } from '@playwright/test';
import { selectOption } from './fields';
async function open(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-18T10:00:00+08:00'));
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('tab', { name: '办理', exact: true }).click();
}
async function addFlow(page: Page, kind: string) {
  await page.getByRole('button', { name: '新增流程', exact: true }).click();
  await selectOption(page, page.getByLabel('流程模板'), kind);
  await page.getByRole('button', { name: '新增', exact: true }).click();
}
test('阶段选择只浏览，任务和日历编辑同一记录，工作清单重试不重复', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '举证', exact: true }).click();
  await expect(page.getByRole('button', { name: '举证', exact: true })).toHaveClass(
    /stage-pending/,
  );
  await page.getByRole('button', { name: '添加待办', exact: true }).click();
  await page.getByLabel('待办内容', { exact: true }).fill('提交补充证据');
  await page.getByLabel('截止日期', { exact: true }).fill('2026-10-18');
  await page.getByLabel('等待事项', { exact: true }).fill('客户补充银行流水');
  await page.getByRole('button', { name: '保存待办', exact: true }).click();
  await expect(page.locator('.work-task-row')).toContainText('客户补充银行流水');
  await page.getByRole('tab', { name: '概况', exact: true }).click();
  await expect(page.locator('.work-task-row').filter({ hasText: '提交补充证据' })).toHaveCount(1);
  await expect(page.locator('.work-overview')).toContainText('1 项等待');
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await page.locator('.time-task').filter({ hasText: '提交补充证据' }).click();
  await page.getByLabel('截止日期', { exact: true }).fill('2026-10-19');
  await page.getByRole('button', { name: '保存待办', exact: true }).click();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await expect(page.locator('.work-task-row').filter({ hasText: '提交补充证据' })).toContainText(
    '2026-10-19',
  );
  await page.locator('.work-origin').filter({ hasText: '举证' }).click();
  await expect(page.locator('.work-stage-heading')).toContainText('举证');
  await page.getByRole('button', { name: '使用工作清单', exact: true }).click();
  await page.getByLabel('阶段工作清单').fill('核对提交稿\n保存提交回执');
  await page.getByRole('button', { name: '添加到本阶段', exact: true }).click();
  await expect(page.locator('.work-task-row')).toHaveCount(3);
  await page.getByRole('button', { name: '使用工作清单', exact: true }).click();
  await page.getByLabel('阶段工作清单').fill('核对提交稿\n保存提交回执');
  await page.getByRole('button', { name: '添加到本阶段', exact: true }).click();
  await expect(page.locator('.work-task-row')).toHaveCount(3);
});
test('并行工作引用同一材料，材料库显示可清除范围，其他页面不重复路径图', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '举证', exact: true }).click();
  await page.getByLabel('选择材料文件').setInputFiles({
    name: '借款合同.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('虚构证据'),
  });
  await expect(page.locator('.material-row')).toHaveCount(1);
  await addFlow(page, 'enforcement');
  await page.getByRole('button', { name: '关联已有材料', exact: true }).click();
  await selectOption(page, page.getByLabel('选择已有记录'), { label: '借款合同.txt' });
  await page.getByLabel('材料用途').fill('执行依据');
  await page.getByRole('button', { name: '关联', exact: true }).click();
  await expect(page.locator('.material-row')).toContainText('执行依据');
  await page.getByRole('button', { name: '在材料库查看', exact: true }).click();
  await expect(page.locator('.work-scope-banner')).toContainText('执行');
  await expect(page.locator('.material-row')).toHaveCount(1);
  await expect(page.locator('.proceeding-path')).toHaveCount(0);
  await page.getByRole('button', { name: '清除工作范围筛选', exact: true }).click();
  await expect(page.locator('.material-scopes button[aria-pressed="true"]')).toContainText(
    '全案材料',
  );
  await expect(page.locator('.material-row')).toHaveCount(1);
  await expect(page.locator('.material-row')).toContainText('一审 · 举证');
  await expect(page.locator('.material-row')).toContainText('执行');
  await page.getByRole('tab', { name: '费用', exact: true }).click();
  await expect(page.locator('.proceeding-path')).toHaveCount(0);
  await page.getByRole('tab', { name: '概况', exact: true }).click();
  await expect(page.locator('.proceeding-path')).toHaveCount(0);
  await expect(page.locator('.work-overview-row')).toHaveCount(2);
});
test('阶段支出就地上传凭据，收费节点按实际收款核销，范围与合计一致', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '举证', exact: true }).click();
  const costs = page.getByRole('region', { name: '阶段费用', exact: true });
  await costs.getByRole('button', { name: '记一笔', exact: true }).click();
  await page.getByLabel('收支金额', { exact: true }).fill('120');
  await page.getByLabel('上传报销凭据文件').setInputFiles({
    name: '交通发票.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('虚构凭据'),
  });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(costs).toContainText('120.00');
  await page.getByRole('button', { name: '查看相关费用', exact: true }).click();
  await expect(page.locator('.work-scope-banner')).toContainText('一审 · 举证');
  await expect(page.locator('.ledger-row')).toHaveCount(1);
  await expect(page.locator('.finance-summary')).toContainText('120.00');
  await page.getByRole('button', { name: '添加收费节点', exact: true }).click();
  await page.getByLabel('收费节点名称').fill('举证阶段约定款');
  await page.getByLabel('节点应收金额').fill('1000');
  await page.getByLabel('已确认满足收款条件').check();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.fee-plan-totals')).toContainText('1,000.00');
  await page.getByRole('button', { name: '记一笔', exact: true }).click();
  await page.getByLabel('收支金额', { exact: true }).fill('600');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.ledger-row')).toHaveCount(2);
  await page.getByRole('button', { name: '核销收款', exact: true }).click();
  await selectOption(page, page.getByLabel('核销收款记录'), { label: /600.00/ });
  await page.getByLabel('核销金额').fill('600');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.fee-plan-totals')).toContainText('400.00');
  await expect(page.locator('.ledger-row')).toHaveCount(2);
  await page.getByRole('button', { name: '返回办理', exact: true }).click();
  await page.getByRole('button', { name: '调整阶段状态', exact: true }).click();
  await page.getByRole('button', { name: '删除此阶段', exact: true }).click();
  await page
    .getByRole('dialog', { name: '删除阶段', exact: true })
    .getByRole('button', { name: '删除', exact: true })
    .click();
  await page.getByRole('tab', { name: '费用', exact: true }).click();
  await expect(page.locator('.work-scope-banner')).toContainText('一审');
  await expect(page.locator('.work-scope-banner')).not.toContainText('举证');
  await expect(page.locator('.ledger-row')).toHaveCount(2);
  await expect(page.locator('.fee-plan-totals')).toContainText('400.00');
});
test('窄屏工作区保留可读字号，无横向溢出，浅深主题都能操作', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '举证', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    for (const width of [800, 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      const overflow = await page
        .locator('.case-page')
        .evaluate((e) => e.scrollWidth - e.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await expect(page.getByRole('button', { name: '添加待办', exact: true })).toBeVisible();
    }
  }
});
