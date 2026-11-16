import { expect, it } from 'vitest';
import {
  speechHasText,
  speechRunning,
  speechTime,
  transcriptionDraft,
  type SpeechSnapshot,
} from './speech';
const result: SpeechSnapshot = {
  phase: 'completed',
  totalSeconds: 90,
  completedSeconds: 90,
  segments: [
    { startSeconds: 0, endSeconds: 45, text: '虚构第一段' },
    { startSeconds: 45, endSeconds: 90, text: '虚构第二段' },
  ],
  partial: null,
  error: null,
};
it('按原音频时间生成可编辑草稿，未完成部分明确标注', () => {
  expect(transcriptionDraft('会谈.m4a', result)).toContain('[00:45] 虚构第二段');
  expect(transcriptionDraft('会谈.m4a', { ...result, phase: 'canceled' })).toContain('部分转写');
  expect(speechTime(3601)).toBe('60:01');
  expect(speechRunning({ ...result, phase: 'authorizing' })).toBe(true);
  expect(speechRunning(result)).toBe(false);
});
it('静音或空结果不生成空白文书', () => {
  const empty = { ...result, segments: [] };
  expect(speechHasText(empty)).toBe(false);
  expect(transcriptionDraft('静音.m4a', empty)).toBe('');
});
