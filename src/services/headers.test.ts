import { it, expect } from 'vitest';
import { jsonHeader } from './headers';
it('中文与emoji录音名称可经ASCII HTTP头无损传输', () => {
  const value = '录音 📝 “会见”.webm';
  const encoded = jsonHeader(value);
  expect([...encoded].every((c) => c.charCodeAt(0) < 128)).toBe(true);
  expect(JSON.parse(encoded)).toBe(value);
  expect(JSON.parse(jsonHeader({ caseId: '123', proceedingId: null }))).toEqual({
    caseId: '123',
    proceedingId: null,
  });
});
