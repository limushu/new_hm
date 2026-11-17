import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function runtime(page: Page, scenario = 'success') {
  await page.addInitScript(
    ({ scenario }) => {
      const fixture = {
        scenario,
        active: '',
        capture: '',
        phase: '',
        hold: scenario === 'partial',
        calls: [] as string[],
        text: scenario === 'overflow' ? '长'.repeat(21000) : '已经核对证据，下次会面讨论起诉方案。',
        release: null as null | (() => void),
      };
      const state = () => ({
        capture: fixture.capture || null,
        speech: fixture.phase
          ? {
              phase: fixture.phase,
              totalSeconds: 10,
              completedSeconds: fixture.phase === 'completed' ? 10 : 5,
              segments:
                fixture.phase === 'transcribing'
                  ? []
                  : [{ startSeconds: 0, endSeconds: 5, text: fixture.text }],
              partial: null,
              error: null,
            }
          : null,
      });
      Object.assign(window, {
        isTauri: true,
        voiceFixture: fixture,
        __TAURI_INTERNALS__: {
          invoke: async (name: string, args: Record<string, unknown>) => {
            const { previewCommand } = await import(
              new URL('/src/services/preview.ts', location.origin).href
            );
            if (name === 'subsystem_manifest') {
              const result = await previewCommand(name, args);
              result.subsystems.push(
                { id: 'recording', state: 'ready', capabilities: ['record-audio'] },
                { id: 'speech', state: 'ready', capabilities: ['transcribe-audio'] },
              );
              return result;
            }
            if (
              [
                'start_dictation',
                'finish_dictation',
                'dictation_state',
                'stop_dictation_transcription',
                'discard_dictation',
              ].includes(name)
            ) {
              fixture.calls.push(name);
              if (name === 'start_dictation') {
                if (fixture.scenario === 'denied') throw { code: 'microphone_permission_denied' };
                if (fixture.active) throw { code: 'dictation_busy' };
                if (fixture.scenario === 'late')
                  await new Promise<void>((resolve) => {
                    fixture.release = resolve;
                  });
                fixture.active = String(args.id);
                fixture.capture = 'recording';
                fixture.phase = '';
                return state();
              }
              if (name === 'discard_dictation') {
                if (fixture.active === args.id) {
                  fixture.active = '';
                  fixture.capture = '';
                  fixture.phase = '';
                }
                return;
              }
              if (name === 'finish_dictation') {
                fixture.capture = '';
                fixture.phase = 'transcribing';
                return state();
              }
              if (name === 'stop_dictation_transcription') {
                fixture.phase = 'canceled';
                return state();
              }
              if (fixture.phase === 'transcribing' && !fixture.hold) fixture.phase = 'completed';
              return state();
            }
            return previewCommand(name, args);
          },
        },
      });
    },
    { scenario },
  );
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await page.locator('.case-card').first().tap();
}
async function recordForm(page: Page) {
  await page.getByRole('button', { name: '创建', exact: true }).tap();
  await page.getByRole('button', { name: /工作记录/ }).tap();
  return page.getByRole('dialog', { name: '添加工作记录', exact: true });
}
async function counts(page: Page) {
  return page.evaluate(async () => {
    const { previewCommand } = await import(
      new URL('/src/services/preview.ts', location.origin).href
    );
    const data = await previewCommand('load_workspace', {});
    return { materials: data.materials.length, records: data.workRecords.length };
  });
}
test('语音正文复用录音识别，追加到最新草稿后显式保存，不创建材料', async ({ page }) => {
  await runtime(page, 'partial');
  const before = await counts(page);
  const sheet = await recordForm(page);
  await sheet.getByLabel('工作记录内容', { exact: true }).fill('先前手写内容');
  await sheet.getByRole('button', { name: '语音输入', exact: true }).tap();
  await expect(sheet.getByRole('button', { name: '保存记录', exact: true })).toBeDisabled();
  await sheet.getByRole('button', { name: '结束并转文字', exact: true }).tap();
  await expect(sheet).toContainText('正在转成文字');
  await sheet.getByLabel('工作记录内容', { exact: true }).fill('先前手写内容\n识别时补充的一句');
  await page.evaluate(() => {
    (window as any).voiceFixture.hold = false;
  });
  await expect(sheet.getByLabel('工作记录内容', { exact: true })).toHaveValue(
    '先前手写内容\n识别时补充的一句\n\n已经核对证据，下次会面讨论起诉方案。',
  );
  await expect(sheet.getByRole('button', { name: '保存记录', exact: true })).toBeEnabled();
  expect(await counts(page)).toEqual(before);
  mkdirSync('artifacts/voice-input', { recursive: true });
  await page.screenshot({ path: 'artifacts/voice-input/work-record-dark.png' });
  await sheet.getByLabel('工作记录内容', { exact: true }).fill('核对后的沟通纪要。');
  await sheet.getByRole('button', { name: '保存记录', exact: true }).tap();
  expect(await counts(page)).toEqual({ materials: before.materials, records: before.records + 1 });
  await expect(page.locator('.case-chronicle')).toContainText('核对后的沟通纪要。');
});
test('拒绝麦克风后仍可手写保存工作记录', async ({ page }) => {
  await runtime(page, 'denied');
  const sheet = await recordForm(page);
  await sheet.getByLabel('工作记录内容', { exact: true }).fill('保留手写内容');
  await sheet.getByRole('button', { name: '语音输入', exact: true }).tap();
  await expect(sheet.getByRole('alert')).toContainText('麦克风');
  await expect(sheet.getByLabel('工作记录内容', { exact: true })).toHaveValue('保留手写内容');
  await expect(sheet.getByRole('button', { name: '保存记录', exact: true })).toBeEnabled();
  await sheet.getByRole('button', { name: '保存记录', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
});
test('关闭编辑页后到达的麦克风授权会被清理，下一次可继续录入', async ({ page }) => {
  await runtime(page, 'late');
  const before = await counts(page);
  let sheet = await recordForm(page);
  await sheet.getByRole('button', { name: '语音输入', exact: true }).tap();
  await expect.poll(() => page.evaluate(() => !!(window as any).voiceFixture.release)).toBe(true);
  await sheet.getByRole('button', { name: '取消', exact: true }).tap();
  await page.evaluate(() => {
    const f = (window as any).voiceFixture;
    f.scenario = 'success';
    f.release();
  });
  await expect.poll(() => page.evaluate(() => (window as any).voiceFixture.active)).toBe('');
  expect(await counts(page)).toEqual(before);
  sheet = await recordForm(page);
  await sheet.getByRole('button', { name: '语音输入', exact: true }).tap();
  await expect(sheet.getByRole('button', { name: '结束并转文字', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: '放弃语音输入', exact: true }).tap();
  await expect(sheet.getByRole('button', { name: '语音输入', exact: true })).toBeVisible();
});
test('停止转写的部分文字核对后采用，清空识别草稿仍可继续编辑', async ({ page }) => {
  await runtime(page, 'partial');
  const sheet = await recordForm(page);
  await sheet.getByLabel('工作记录内容', { exact: true }).fill('原有内容');
  await sheet.getByRole('button', { name: '语音输入', exact: true }).tap();
  await sheet.getByRole('button', { name: '结束并转文字', exact: true }).tap();
  await sheet.getByRole('button', { name: '停止转写', exact: true }).tap();
  await expect(sheet.getByLabel('工作记录内容', { exact: true })).toHaveValue('原有内容');
  const text = sheet.getByLabel('待追加的识别文字', { exact: true });
  await text.fill('');
  await expect(text).toBeVisible();
  await text.fill('校对后的部分文字');
  await sheet.getByRole('button', { name: '追加到正文', exact: true }).tap();
  await expect(sheet.getByLabel('工作记录内容', { exact: true })).toHaveValue(
    '原有内容\n\n校对后的部分文字',
  );
});
test('超出长度限制保留完整识别结果，精简后追加而非截断', async ({ page }) => {
  await runtime(page, 'overflow');
  const sheet = await recordForm(page);
  await sheet.getByLabel('工作记录内容', { exact: true }).fill('既有记录');
  await sheet.getByRole('button', { name: '语音输入', exact: true }).tap();
  await sheet.getByRole('button', { name: '结束并转文字', exact: true }).tap();
  const text = sheet.getByLabel('待追加的识别文字', { exact: true });
  await expect(text).toHaveValue('长'.repeat(21000));
  await expect(sheet.getByRole('button', { name: '追加到正文', exact: true })).toBeDisabled();
  await expect(sheet.getByRole('button', { name: '保存记录', exact: true })).toBeDisabled();
  await text.fill('精简后的纪要');
  await sheet.getByRole('button', { name: '追加到正文', exact: true }).tap();
  await expect(sheet.getByLabel('工作记录内容', { exact: true })).toHaveValue(
    '既有记录\n\n精简后的纪要',
  );
});
test('新建文档与关键事件说明复用语音入口', async ({ page }) => {
  await runtime(page);
  for (const [name, field] of [
    ['新建文档', '文档正文'],
    ['关键事件', '事件说明'],
  ]) {
    await page.getByRole('button', { name: '创建', exact: true }).tap();
    await page.getByRole('button', { name: new RegExp(name) }).tap();
    const sheet = page.getByRole('dialog', { name, exact: true });
    await sheet.getByRole('button', { name: '语音输入', exact: true }).tap();
    await sheet.getByRole('button', { name: '结束并转文字', exact: true }).tap();
    await expect(sheet.getByLabel(field, { exact: true })).toHaveValue(
      '已经核对证据，下次会面讨论起诉方案。',
    );
    await sheet.getByRole('button', { name: '取消', exact: true }).tap();
    if (name === '新建文档')
      await page.getByRole('button', { name: '放弃文档', exact: true }).tap();
  }
});
