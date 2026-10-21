import { expect, it } from 'vitest';
import { errorMessage, localizedError } from './errors';

it('按稳定错误码翻译并保留机器字段，不显示系统诊断', () => {
  const source = {
    code: 'permission_denied',
    kind: 'permission-denied',
    detail: '/private/provider/file: EACCES',
  };
  const error = localizedError(source);
  expect(error.message).toBe('没有访问权限，请检查系统授权后重试');
  expect(error).toMatchObject(source);
  expect(String(error)).not.toContain('/private');
});
it('能力提示只翻译受支持的资源标识，不直接展示未知资源', () => {
  expect(errorMessage({ code: 'capability_unsupported', resource: 'audio_capture' })).toContain(
    '原生录音',
  );
  expect(errorMessage({ code: 'capability_unsupported', resource: 'unknown_driver' })).toBe(
    '当前平台暂不支持此操作',
  );
});
it('旧错误保留具体校验信息，未知协议错误提供可读兜底', () => {
  expect(errorMessage('名称不能为空')).toBe('名称不能为空');
  expect(errorMessage({ code: 'legacy_error', detail: '案件已经归档' })).toBe('案件已经归档');
  expect(errorMessage({ code: 'new_code', detail: 'internal diagnostics' })).toBe(
    '操作未完成，请重试',
  );
  expect(errorMessage({ unexpected: true })).toBe('操作未完成，请重试');
  expect(errorMessage({ code: 'constructor' })).toBe('操作未完成，请重试');
});
