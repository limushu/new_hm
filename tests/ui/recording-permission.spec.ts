import { test, expect } from '@playwright/test';
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream'] }, permissions: [] });
test('拒绝麦克风权限时保留窗口并说明失败，不伪装成录音成功', async ({ page, context }) => {
  const session = await context.newCDPSession(page);
  const { targetInfo } = await session.send('Target.getTargetInfo');
  await session.send('Browser.setPermission', {
    browserContextId: targetInfo.browserContextId,
    permission: { name: 'microphone' },
    setting: 'denied',
    origin: 'http://127.0.0.1:1420',
  });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  await page.getByRole('button', { name: '录音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('无法开始录音');
  await expect(page.getByRole('button', { name: '保存录音', exact: true })).toHaveCount(0);
  await session.detach();
});
