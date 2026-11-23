import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

// Exercise the shared navigation port; the SDK suite sends the real Android key.
async function systemBack(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/platform/backNavigation.ts';
    return (await import(path)).backNavigation.request();
  });
}

test('系统返回先关闭材料预览，第二次才离开案件', async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  const caseTitle = await page.getByLabel('案件名称', { exact: true }).inputValue();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '添加材料', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: '系统返回.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('虚构材料'),
  });
  await page.getByRole('button', { name: '系统返回.txt', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '预览 系统返回.txt' })).toBeVisible();
  expect(await systemBack(page)).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('案件名称', { exact: true })).toHaveValue(caseTitle);
  expect(await systemBack(page)).toBe(true);
  await expect(page.getByLabel('案件名称', { exact: true })).toHaveCount(0);
  await expect(page.locator('.case-card').first()).toBeVisible();
});

test('系统返回取消日程草稿并保留今天页面', async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '新建日程', exact: true }).click();
  await page.getByLabel('日程名称', { exact: true }).fill('不应保存的虚构日程');
  expect(await systemBack(page)).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.calendar-page')).toBeVisible();
  await expect(page.getByRole('button', { name: /不应保存的虚构日程/ })).toHaveCount(0);
});

test('系统返回完成欢迎页，不执行底层退出动作', async ({ page }) => {
  await page.goto('/?preview=1&welcome=1');
  await expect(page.getByRole('dialog', { name: '欢迎使用案笺' })).toBeVisible();
  expect(await systemBack(page)).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.calendar-page')).toBeVisible();
});
