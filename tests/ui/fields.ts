import type { Locator, Page } from '@playwright/test';
export async function openLegacyCase(page: Page) {
  await page.getByRole('button', { name: '案件管理', exact: true }).click();
  await page.getByRole('button', { name: '历史流程资料', exact: true }).click();
}
export async function openCaseArchive(page: Page) {
  await page.getByRole('tab', { name: '脉络', exact: true }).click();
  const panel = page.locator('.case-workspace-details');
  if (!(await panel.evaluate((e: HTMLDetailsElement) => e.open)))
    await panel.locator(':scope > summary').click();
}
export async function openFinanceDetails(page: Page) {
  for (const selector of ['.finance-fee-plans', '.finance-analysis']) {
    const panel = page.locator(selector);
    if (
      (await panel.count()) &&
      (await panel.evaluate((e) => e.tagName === 'DETAILS')) &&
      !(await panel.evaluate((e: HTMLDetailsElement) => e.open))
    )
      await panel.locator(':scope > summary').click();
  }
}
export async function requestCaseDeletion(page: Page) {
  await page.getByRole('button', { name: '案件管理', exact: true }).click();
  await page.getByRole('button', { name: '删除案件', exact: true }).click();
}
export async function selectOption(
  page: Page,
  field: Locator,
  option: string | { label: string | RegExp },
) {
  const name = await field.getAttribute('aria-label');
  await field.click();
  const list = page.getByRole('listbox', { name: `${name}选项`, exact: true });
  if (typeof option === 'string')
    await list.locator(`[role="option"][data-value="${option}"]`).click();
  else await list.getByRole('option', { name: option.label }).click();
}
export async function openFlowDetails(page: Page) {
  const details = page.locator('.work-details');
  await expectDialogClosed(page);
  if ((await details.count()) && !(await details.evaluate((e: HTMLDetailsElement) => e.open)))
    await details.locator(':scope > summary').click();
}
async function expectDialogClosed(page: Page) {
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
export async function changeStageState(page: Page, name: string, state: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: '调整阶段状态', exact: true }).click();
  await selectOption(page, page.getByLabel('阶段状态', { exact: true }), state);
  await page.getByRole('button', { name: '应用', exact: true }).click();
}
export async function showWorkHistory(page: Page) {
  const history = page.locator('.work-history-panel');
  if (!(await history.evaluate((e: HTMLDetailsElement) => e.open)))
    await history.locator(':scope > summary').click();
}
