import { expect, test } from '@playwright/test';

test('iOS 原生录音授权失败可重试，中断后继续并按 M4A 归档', async ({ page }) => {
  await page.addInitScript(() => {
    let denied = true;
    let state = 'idle';
    Object.assign(window, {
      isTauri: true,
      nativeAudioCalls: [] as string[],
      interruptAudio: () => {
        state = 'paused';
      },
      __TAURI_INTERNALS__: {
        invoke: async (name: string, args: Record<string, unknown>) => {
          if (name === 'subsystem_manifest')
            return {
              version: 1,
              subsystems: [{ id: 'recording', state: 'ready', capabilities: ['record-audio'] }],
            };
          if (name === 'native_recording_support')
            return {
              native: { capture: true, pause: true },
              webviewFallback: false,
            };
          if (name.includes('native_recording')) {
            (window as unknown as { nativeAudioCalls: string[] }).nativeAudioCalls.push(name);
            switch (name) {
              case 'start_native_recording':
                if (denied) {
                  denied = false;
                  throw { code: 'microphone_permission_denied', kind: 'permission-denied' };
                }
                state = 'recording';
                return;
              case 'native_recording_state':
                return state;
              case 'pause_native_recording':
                state = 'paused';
                return;
              case 'resume_native_recording':
                state = 'recording';
                return;
              case 'finish_native_recording':
                state = 'finished';
                return 'recording.m4a';
              case 'cancel_native_recording':
                state = 'idle';
                return;
              case 'archive_native_recording': {
                const { previewCommand, registerPreviewFiles } = await import(
                  '/src/services/preview.ts'
                );
                await previewCommand('import_material_paths', {
                  target: args.target,
                  paths: registerPreviewFiles([
                    new File(['audio fixture'], args.name as string, { type: 'audio/mp4' }),
                  ]),
                });
                return;
              }
            }
          }
          if (name === 'save_recording') throw new Error('Unexpected WebView capture');
          const { previewCommand } = await import('/src/services/preview.ts');
          return previewCommand(name, args);
        },
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  await page.getByRole('button', { name: '录音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('麦克风权限未开启');
  const startButton = page.getByRole('button', { name: '开始录音', exact: true });
  await startButton.hover();
  await expect(startButton).toHaveCSS('background-color', 'rgb(57, 119, 183)');
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { interruptAudio(): void }).interruptAudio());
  await expect(page.getByRole('button', { name: '继续', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '结束录音', exact: true }).click();
  await expect(page.getByLabel('录音名称')).toHaveValue(/\.m4a$/);
  await page.getByLabel('录音名称').fill('iPhone 会见.m4a');
  await page.getByRole('button', { name: '保存录音', exact: true }).click();
  await expect(page.locator('.material-row')).toContainText('iPhone 会见.m4a');
  const calls = await page.evaluate(
    () => (window as unknown as { nativeAudioCalls: string[] }).nativeAudioCalls,
  );
  expect(calls.filter((name) => name === 'archive_native_recording')).toHaveLength(1);
  expect(calls).not.toContain('cancel_native_recording');
});
