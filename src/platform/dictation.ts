import { nativeInvoke } from './ipc';
import type { SpeechSnapshot } from './speech';

export interface DictationSnapshot {
  capture: 'recording' | 'paused' | 'interrupted' | 'finished' | null;
  speech: SpeechSnapshot | null;
}

/** Serialize each editor's operations and let cleanup await a late permission reply. */
export class DictationSession {
  readonly id = crypto.randomUUID();
  private queue: Promise<unknown> = Promise.resolve();
  private closing: Promise<void> | null = null;
  private disposed = false;
  private call(command: string, args = {}) {
    if (this.disposed) return Promise.reject(new Error('这次语音输入已结束'));
    const operation = this.queue
      .catch(() => {})
      .then(() => nativeInvoke<DictationSnapshot>(command, { id: this.id, ...args }));
    this.queue = operation;
    return operation;
  }
  start(language = 'zh-CN') {
    return this.call('start_dictation', { language });
  }
  finish() {
    return this.call('finish_dictation');
  }
  snapshot() {
    return this.call('dictation_state');
  }
  stop() {
    return this.call('stop_dictation_transcription');
  }
  dispose(): Promise<void> {
    if (this.closing) return this.closing;
    this.disposed = true;
    this.closing = this.queue
      .catch(() => {})
      .then(() => nativeInvoke<void>('discard_dictation', { id: this.id }))
      .catch((error) => {
        this.closing = null; // Explicit retry remains possible after a bridge failure.
        throw error;
      });
    this.queue = this.closing;
    return this.closing;
  }
}

export function dictationText(snapshot: SpeechSnapshot): string {
  return [...snapshot.segments, ...(snapshot.partial ? [snapshot.partial] : [])]
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join('\n');
}
/** Use the latest draft; voice input never replaces text typed during recognition. */
export function appendDictation(body: string, text: string, maxLength?: number): string | null {
  const value = text.trim();
  if (!value) return body;
  const result = body + (body && !body.endsWith('\n') ? '\n\n' : '') + value;
  return maxLength != null && result.length > maxLength ? null : result;
}
