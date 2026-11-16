import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function speechRuntime(page: Page, scenario = 'success') {
  await page.addInitScript(
    ({ scenario }) => {
      const fixture = {
        scenario,
        archives: 0,
        starts: 0,
        discards: 0,
        saved: 0,
        polls: 0,
        active: '',
        source: '',
        capture: 'recording',
        failArchive: false,
        hold: false,
      };
      const transcripts = new Map<string, string>();
      Object.assign(window, {
        isTauri: true,
        speechFixture: fixture,
        __TAURI_INTERNALS__: {
          convertFileSrc: (path: string) => path,
          invoke: async (name: string, args: Record<string, unknown>) => {
            const { previewCommand, registerPreviewFiles } = await import(
              new URL('/src/services/preview.ts', location.href).href
            );
            if (name === 'subsystem_manifest')
              return {
                version: 1,
                subsystems: [
                  { id: 'recording', state: 'ready', capabilities: ['record-audio'] },
                  { id: 'speech', state: 'ready', capabilities: ['transcribe-audio'] },
                  { id: 'documents', state: 'ready', capabilities: ['file-picker'] },
                ],
              };
            if (name === 'native_recording_support')
              return { native: { capture: true, pause: true }, webviewFallback: false };
            if (name === 'start_native_recording') {
              fixture.capture = 'recording';
              return;
            }
            if (name === 'finish_native_recording') {
              fixture.capture = 'finished';
              return 'capture.m4a';
            }
            if (name === 'native_recording_state') return fixture.capture;
            if (name === 'cancel_native_recording') return;
            if (name === 'archive_native_recording') {
              fixture.archives++;
              if (fixture.failArchive) {
                fixture.failArchive = false;
                throw { kind: 'io', code: 'io_failed' };
              }
              const data = await previewCommand('load_workspace', {});
              const before = new Set(data.materials.map((m) => m.id));
              await previewCommand('import_material_paths', {
                target: args.target,
                paths: registerPreviewFiles([new File(['fictional-audio'], args.name as string)]),
              });
              const after = await previewCommand('load_workspace', {});
              fixture.source = after.materials.find((m) => !before.has(m.id))!.id;
              return fixture.source;
            }
            if (name === 'speech_support')
              return {
                installed: true,
                onDevice: fixture.scenario !== 'unavailable',
                available: true,
                authorization: 'notDetermined',
              };
            const snapshot = (phase: string) => ({
              phase,
              totalSeconds: 12,
              completedSeconds: phase === 'completed' ? 12 : 6,
              segments:
                phase === 'authorizing'
                  ? []
                  : [{ startSeconds: 0, endSeconds: 6, text: '这是一段虚构会谈记录。' }],
              partial: null,
              error: null,
            });
            if (name === 'start_transcription') {
              fixture.starts++;
              fixture.active = args.id as string;
              fixture.polls = 0;
              if (fixture.scenario === 'denied')
                return { ...snapshot('failed'), segments: [], error: 'speech_permission_denied' };
              return snapshot('authorizing');
            }
            if (name === 'transcription_state') {
              fixture.polls++;
              return snapshot(fixture.hold ? 'transcribing' : 'completed');
            }
            if (name === 'cancel_transcription') return snapshot('canceled');
            if (name === 'discard_transcription') {
              fixture.discards++;
              if (fixture.active === args.id) fixture.active = '';
              return;
            }
            if (name === 'save_transcription') {
              fixture.saved++;
              if (transcripts.has(args.documentId as string))
                return transcripts.get(args.documentId as string);
              const data = await previewCommand('load_workspace', {});
              const source = data.materials.find((m) => m.id === fixture.source)!;
              const id = await previewCommand('create_text_document', {
                target: {
                  caseId: source.caseId,
                  proceedingId: source.proceedingId,
                  parentId: source.parentId,
                  recordId: source.recordId,
                },
                name: args.name,
                body: args.body,
              });
              await previewCommand('save_resource_relation', {
                input: {
                  id: crypto.randomUUID(),
                  caseId: source.caseId,
                  source: { kind: 'material', id },
                  target: { kind: 'material', id: source.id },
                  kind: 'transcript_of',
                  label: '',
                },
              });
              transcripts.set(args.documentId as string, id);
              return id;
            }
            return previewCommand(name, args);
          },
        },
      });
    },
    { scenario },
  );
}
async function record(page: Page) {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await page.locator('.case-card').first().tap();
  await page.getByRole('tab', { name: '材料', exact: true }).tap();
  await page.getByRole('button', { name: '录音', exact: true }).tap();
  await page.getByLabel('录音名称', { exact: true }).fill('语音演示.m4a');
  await page.getByRole('button', { name: '开始录音', exact: true }).tap();
  await page.getByRole('button', { name: '结束录音', exact: true }).tap();
}
test('录音结束一键转写，先保留原音频，编辑后另存文字并关联', async ({ page }) => {
  await speechRuntime(page);
  await record(page);
  await page.getByRole('button', { name: '转成文字', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: '语音转文字', exact: true });
  await expect(sheet).toContainText('转写完成');
  await expect(sheet.getByLabel('转写文字', { exact: true })).toContainText('虚构会谈记录');
  await sheet.getByLabel('转写文字', { exact: true }).fill('');
  await expect(sheet.getByLabel('转写文字', { exact: true })).toBeVisible();
  await sheet.getByLabel('转写文字', { exact: true }).fill('人工校对后的虚构会谈纪要');
  mkdirSync('artifacts/transcription', { recursive: true });
  await page.screenshot({ path: 'artifacts/transcription/completed-dark.png' });
  await sheet.getByRole('button', { name: '保存转写稿', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.material-row').filter({ hasText: '语音演示.m4a' })).toHaveCount(1);
  const row = page.locator('.material-row').filter({ hasText: '语音演示 转写.md' });
  await expect(row).toHaveCount(1);
  await row.locator('.material-name').tap();
  await expect(page.locator('.text-document-preview')).toHaveText('人工校对后的虚构会谈纪要');
  const calls = await page.evaluate(
    () =>
      (window as unknown as { speechFixture: { archives: number; starts: number; saved: number } })
        .speechFixture,
  );
  expect(calls.archives).toBe(1);
  expect(calls.starts).toBe(1);
  expect(calls.saved).toBe(1);
});
test('识别权限拒绝时原录音保留，无空白转写稿', async ({ page }) => {
  await speechRuntime(page, 'denied');
  await record(page);
  await page.getByRole('button', { name: '转成文字', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: '语音转文字', exact: true });
  await expect(sheet.getByRole('alert')).toContainText('语音识别权限未开启');
  await expect(sheet.getByRole('button', { name: '保存转写稿', exact: true })).toHaveCount(0);
  await sheet.getByRole('button', { name: '关闭', exact: true }).last().tap();
  await expect(page.locator('.material-row').filter({ hasText: '语音演示.m4a' })).toHaveCount(1);
  await expect(page.locator('.material-row').filter({ hasText: '转写.md' })).toHaveCount(0);
});
test('离线模型不支持时不发起识别，不静默切换云端', async ({ page }) => {
  await speechRuntime(page, 'unavailable');
  await record(page);
  await page.getByRole('button', { name: '转成文字', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: '语音转文字', exact: true })).toContainText(
    '暂不支持当前语言',
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { speechFixture: { starts: number } }).speechFixture.starts,
    ),
  ).toBe(0);
});
test('停止转写可保存已识别部分，保存前关闭需要确认', async ({ page }) => {
  await speechRuntime(page);
  await record(page);
  await page.evaluate(() => {
    (window as unknown as { speechFixture: { hold: boolean } }).speechFixture.hold = true;
  });
  await page.getByRole('button', { name: '转成文字', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: '语音转文字', exact: true });
  await expect(sheet).toContainText('正在转成文字');
  await sheet.getByRole('button', { name: '停止转写', exact: true }).tap();
  await expect(sheet).toContainText('已识别的部分');
  await sheet.getByRole('button', { name: '取消', exact: true }).tap();
  const confirm = page.getByRole('dialog', { name: '放弃未保存的转写？', exact: true });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '取消', exact: true }).tap();
  await sheet.getByRole('button', { name: '保存已识别部分', exact: true }).tap();
  await expect(page.locator('.material-row').filter({ hasText: '语音演示 转写.md' })).toHaveCount(
    1,
  );
});
test('录音归档失败可重试，未保存前不启动转写', async ({ page }) => {
  await speechRuntime(page);
  await record(page);
  await page.evaluate(() => {
    (window as unknown as { speechFixture: { failArchive: boolean } }).speechFixture.failArchive =
      true;
  });
  await page.getByRole('button', { name: '转成文字', exact: true }).tap();
  await expect(
    page.getByRole('dialog', { name: '案件录音', exact: true }).getByRole('alert'),
  ).toContainText('文件操作失败');
  expect(
    await page.evaluate(
      () => (window as unknown as { speechFixture: { starts: number } }).speechFixture.starts,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: '转成文字', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: '语音转文字', exact: true })).toContainText(
    '转写完成',
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { speechFixture: { archives: number } }).speechFixture.archives,
    ),
  ).toBe(2);
});
