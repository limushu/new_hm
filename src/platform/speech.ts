import { nativeInvoke } from './ipc';

export interface SpeechSupport {
  installed: boolean;
  onDevice: boolean;
  available: boolean;
  authorization: 'notDetermined' | 'authorized' | 'denied' | 'restricted' | 'unavailable';
}
export interface SpeechSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
}
export interface SpeechSnapshot {
  phase: 'authorizing' | 'transcribing' | 'completed' | 'failed' | 'canceled';
  totalSeconds: number;
  completedSeconds: number;
  segments: SpeechSegment[];
  partial: SpeechSegment | null;
  error: string | null;
}
export const speechSupport = (language: string) =>
  nativeInvoke<SpeechSupport>('speech_support', { language });
export const startTranscription = (id: string, materialId: string, language: string) =>
  nativeInvoke<SpeechSnapshot>('start_transcription', { id, materialId, language });
export const transcriptionState = (id: string) =>
  nativeInvoke<SpeechSnapshot>('transcription_state', { id });
export const cancelTranscription = (id: string) =>
  nativeInvoke<SpeechSnapshot>('cancel_transcription', { id });
export const discardTranscription = (id: string) =>
  nativeInvoke<void>('discard_transcription', { id });
export const speechRunning = (s: SpeechSnapshot | null) =>
  s?.phase === 'authorizing' || s?.phase === 'transcribing';
export const speechHasText = (s: SpeechSnapshot | null) =>
  !!s && [...s.segments, ...(s.partial ? [s.partial] : [])].some((v) => v.text.trim());
export function speechTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)
    .toString()
    .padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}
export function transcriptionDraft(sourceName: string, snapshot: SpeechSnapshot): string {
  if (!speechHasText(snapshot)) return '';
  const rows = [...snapshot.segments, ...(snapshot.partial ? [snapshot.partial] : [])];
  return (
    `原录音：${sourceName}\n${snapshot.phase === 'completed' ? '转写草稿' : '部分转写'}，请对照原录音核对。\n\n` +
    rows
      .filter((s) => s.text.trim())
      .map((s) => `[${speechTime(s.startSeconds)}] ${s.text}`)
      .join('\n\n')
  );
}
export const isAudioMaterial = (name: string) =>
  /\.(m4a|mp3|wav|aac|aif|aiff|caf|ogg|webm)$/i.test(name);
