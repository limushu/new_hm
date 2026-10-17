import { selectOption } from './fields';
import { expect, test, type Page } from '@playwright/test';
const caseTitle = '张某与李某借款纠纷（示例）';
async function openCase(page: Page) {
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').filter({ hasText: caseTitle }).click();
}
async function materials(page: Page) {
  await openCase(page);
  await page.getByRole('button', { name: '材料', exact: true }).click();
}
function samplePdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    '<< /Length 43 >>\nstream\nBT /F1 18 Tf 50 700 Td (Page One) Tj ET\nendstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    '<< /Length 43 >>\nstream\nBT /F1 18 Tf 50 700 Td (Page Two) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
      .join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/?preview=1');
});

test('材料导入、同名保留、改名、文件夹移动与回收恢复', async ({ page }) => {
  await materials(page);
  const input = page.getByLabel('选择材料文件');
  const file = { name: '借条.txt', mimeType: 'text/plain', buffer: Buffer.from('虚构材料') };
  await input.setInputFiles(file);
  await expect(page.locator('.material-row')).toHaveCount(1);
  await input.setInputFiles(file);
  await expect(page.locator('.material-row')).toHaveCount(2);
  await expect(page.locator('.material-list')).toContainText('借条 (1).txt');
  await page.getByRole('button', { name: '借条.txt的操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click();
  await page.getByLabel('材料名称', { exact: true }).fill('借条原件.txt');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.material-list')).toContainText('借条原件.txt');
  await page.getByRole('button', { name: '文件夹', exact: true }).click();
  await page.getByLabel('文件夹名称').fill('证据');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '借条原件.txt的操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '移动到…', exact: true }).click();
  await selectOption(page, page.getByLabel('目标文件夹'), { label: '证据' });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '证据', exact: true }).click();
  await expect(page.locator('.material-row')).toHaveCount(1);
  await page.getByRole('button', { name: '借条原件.txt的操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '移入回收站', exact: true }).click();
  await page.getByRole('button', { name: '移入回收站', exact: true }).click();
  await expect(page.locator('.material-row')).toHaveCount(0);
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '回收站', exact: true }).click();
  await expect(page.locator('.trash-item')).toContainText('借条原件.txt');
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await expect(page.locator('.trash-item')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await page.getByLabel('全局搜索', { exact: true }).fill('借条原件');
  await page.getByRole('button', { name: /借条原件.txt/ }).click();
  await expect(page.locator('.material-row.is-focused')).toContainText('借条原件.txt');
  await expect(page.locator('.material-breadcrumb')).toContainText('证据');
});
test('PDF内嵌预览支持翻页和缩放，关闭后保留材料位置', async ({ page }) => {
  await materials(page);
  await page
    .getByLabel('选择材料文件')
    .setInputFiles({ name: '示例.pdf', mimeType: 'application/pdf', buffer: samplePdf() });
  await page.getByRole('button', { name: '示例.pdf', exact: true }).dblclick();
  const preview = page.getByRole('dialog', { name: '预览 示例.pdf', exact: true });
  await expect(preview).toBeVisible();
  await expect(preview.locator('.preview-controls')).toContainText('1 / 2', { timeout: 20000 });
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(preview.locator('.preview-controls')).toContainText('2 / 2');
  await page.getByRole('button', { name: '放大', exact: true }).click();
  await expect(preview.locator('.preview-controls')).toContainText('125%');
  await page.getByRole('button', { name: '关闭预览', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(page.locator('.material-row')).toContainText('示例.pdf');
});
test('联系对象原位关联、关系图和双向案件跳转', async ({ page }) => {
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  await page.getByRole('button', { name: '新建对象', exact: true }).click();
  await page.getByLabel('对象名称', { exact: true }).fill('虚构王甲');
  await page.getByLabel('对象电话', { exact: true }).fill('示例号码');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.feature-list')).toContainText('虚构王甲');
  await openCase(page);
  await page.getByRole('button', { name: '案件信息', exact: true }).click();
  await page.getByRole('button', { name: '关联对象', exact: true }).click();
  await page.getByRole('combobox', { name: '选择联系对象', exact: true }).fill('虚构王甲');
  await page.getByRole('option', { name: /虚构王甲/ }).click();
  await page.getByLabel('案件对象身份').fill('委托人');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '关系图', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '案件关系图', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看虚构王甲', exact: true }).click();
  await page
    .getByRole('dialog', { name: '虚构王甲', exact: true })
    .getByRole('button', { name: '反向关联', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: '虚构王甲', exact: true })).toContainText('委托人');
  await page.getByRole('button', { name: /张某与李某借款纠纷（示例）.*委托人/ }).click();
  await expect(page.getByRole('textbox', { name: '案件名称', exact: true })).toHaveValue(caseTitle);
});
test('律师费与垫付支出使用精确金额并独立跟踪报销', async ({ page }) => {
  await openCase(page);
  await page.getByRole('button', { name: '收支', exact: true }).click();
  await page.getByRole('button', { name: '修改约定', exact: true }).click();
  await page.getByRole('textbox', { name: '约定律师费', exact: true }).fill('10000');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '记一笔', exact: true }).click();
  await page.getByLabel('收支金额').fill('3000');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.fee-summary')).toContainText('7,000.00');
  await page.getByRole('button', { name: '记一笔', exact: true }).click();
  await selectOption(page, page.getByLabel('收支类型'), 'expense');
  await page.getByLabel('收支金额').fill('750.50');
  await selectOption(page, page.getByLabel('报销状态'), 'pending');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.ledger-row')).toHaveCount(2);
  await expect(page.locator('.finance-summary')).toContainText('750.50');
  await page.getByRole('button', { name: /交通费.*待报销/ }).click();
  await selectOption(page, page.getByLabel('报销状态'), 'received');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.ledger-row').filter({ hasText: '已报销' })).toHaveCount(1);
  await expect(page.locator('.ledger-row').filter({ hasText: '律师费' })).toHaveCount(1);
});
test('阶段管理和记录关键事件，不自动将程序结束等同结案', async ({ page }) => {
  await openCase(page);
  await page.getByRole('button', { name: '案件信息', exact: true }).click();
  await page.getByRole('button', { name: '举证', exact: true }).click();
  await expect(page.getByLabel('当前程序', { exact: true })).toContainText('举证');
  await expect(page.getByLabel('案件状态', { exact: true })).toHaveAttribute(
    'data-value',
    'in_progress',
  );
  await page.getByRole('button', { name: '管理阶段', exact: true }).click();
  await page.getByRole('button', { name: '新增阶段', exact: true }).click();
  await page.getByLabel('阶段名称').fill('鉴定');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '新增阶段', exact: true })).toHaveCount(0);
  await page
    .getByRole('dialog', { name: '管理办理阶段', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .last()
    .click();
  await expect(page.getByRole('button', { name: '鉴定', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '记录事件', exact: true }).click();
  await page.getByLabel('事件名称').fill('示例开庭');
  await page.getByLabel('事件日期', { exact: true }).fill('2026-11-05');
  await page.getByRole('checkbox', { name: '同时加入此案件的日历' }).check();
  await selectOption(page, page.getByLabel('事件提醒'), '1440');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.case-event')).toContainText('示例开庭');
});
test('工作记录可编辑、归档附件、移入回收站并恢复', async ({ page }) => {
  await openCase(page);
  await page.getByRole('button', { name: '记录', exact: true }).click();
  await page.getByLabel('工作记录内容').fill('初始记录');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await page.locator('.work-record').getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('工作记录内容').fill('修改后的记录');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await page.getByRole('button', { name: '附件', exact: true }).click();
  await page.getByLabel('选择材料文件').setInputFiles({
    name: '记录附件.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('记录附件'),
  });
  await expect(page.locator('.material-row')).toContainText('记录附件.txt');
  await page
    .getByRole('dialog', { name: '工作记录附件', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .last()
    .click();
  await page.getByRole('button', { name: '将工作记录移入回收站', exact: true }).click();
  await page.getByRole('button', { name: '移入回收站', exact: true }).click();
  await expect(page.locator('.work-record')).toHaveCount(0);
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '回收站', exact: true }).click();
  await expect(page.locator('.trash-item')).toContainText('修改后的记录');
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await openCase(page);
  await expect(page.locator('.work-record')).toContainText('修改后的记录');
});
test('可新增自定义状态列并通过键盘移动案件', async ({ page }) => {
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.getByRole('button', { name: '新增状态', exact: true }).click();
  await page.getByLabel('状态名称').fill('等待反馈');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.case-column')).toHaveCount(4);
  await page.locator('.case-card').filter({ hasText: caseTitle }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: '等待反馈案件', exact: true })).toContainText(
    caseTitle,
  );
});
test('日程提醒可选择，默认仍不关联案件', async ({ page }) => {
  await page.getByRole('button', { name: '新建日程', exact: true }).click();
  await page.getByLabel('日程名称', { exact: true }).fill('带提醒日程');
  await selectOption(page, page.getByLabel('日程提醒时间'), '15');
  await expect(page.getByRole('button', { name: '关联案件', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保存日程', exact: true }).click();
  await page.locator('.time-event').filter({ hasText: '带提醒日程' }).click();
  await expect(page.getByLabel('日程提醒时间')).toHaveAttribute('data-value', '15');
});
