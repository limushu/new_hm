import { expect, it } from 'vitest';
import { requireSuccessfulIosUpload } from './ios-upload.mjs';
it('requires explicit Apple upload success', () => {
  expect(() =>
    requireSuccessfulIosUpload({
      status: 0,
      stdout: 'UPLOAD SUCCEEDED with no errors',
      stderr: '',
    }),
  ).not.toThrow();
});
it('rejects zero-exit validation failures, absent receipts and unsuccessful processes', () => {
  for (const result of [
    {
      status: 0,
      stderr: 'UPLOAD FAILED with 1 error\nValidation failed (409) Invalid large app icon',
    },
    { status: 0, stdout: '' },
    { status: 1, stdout: 'UPLOAD SUCCEEDED' },
    { status: 0, error: new Error('transport failed'), stdout: 'UPLOAD SUCCEEDED' },
  ])
    expect(() => requireSuccessfulIosUpload(result)).toThrow('Apple did not confirm');
});
