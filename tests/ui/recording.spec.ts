import { test, expect } from '@playwright/test';
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
});
test('录音可开始、暂停、继续、结束和归档，不会自动关联其他案件', async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  await page.getByRole('button', { name: '录音', exact: true }).click();
  await page.getByRole('textbox', { name: '录音名称', exact: true }).fill('会见测试.webm');
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '结束录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存录音', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保存录音', exact: true }).click();
  await expect(page.locator('.material-row')).toContainText('会见测试.webm');
});
