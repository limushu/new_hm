import { capabilityNames, operationMessages } from '../i18n/zh-CN';

import type { OperationError } from '../domain/types';
export type { OperationError } from '../domain/types';
export function isOperationError(value: unknown): value is OperationError {
  return (
    typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string'
  );
}
export function errorMessage(value: unknown): string {
  if (isOperationError(value)) {
    if (value.code === 'legacy_error' && typeof value.detail === 'string') return value.detail;
    if (value.code === 'capability_unsupported') {
      const label = value.resource && capabilityNames[value.resource];
      return typeof label === 'string'
        ? `当前平台暂不支持${label}`
        : operationMessages.capability_unsupported;
    }
    const translated = operationMessages[value.code];
    return (
      (typeof translated === 'string' ? translated : undefined) ??
      (value.kind === 'permission-denied'
        ? operationMessages.permission_denied
        : value.kind === 'interrupted'
          ? operationMessages.operation_interrupted
          : value.kind === 'io'
            ? operationMessages.io_failed
            : '操作未完成，请重试')
    );
  }
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  return '操作未完成，请重试';
}
export function localizedError(value: unknown): Error {
  const error = new Error(errorMessage(value));
  if (isOperationError(value)) Object.assign(error, value, { message: errorMessage(value) });
  return error;
}
