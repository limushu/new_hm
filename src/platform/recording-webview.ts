/** Compatibility capture backend. Native drivers can replace it without changing the UI. */
import type { RecordingCapture, RecordingProduct } from './recording';
import { saveNativeRecording } from './recording';

export async function startWebviewRecording(
  onError: (message: string) => void,
): Promise<RecordingCapture> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前设备不支持录音');
  const type = ['audio/webm;codecs=opus', 'audio/webm'].find((value) =>
    MediaRecorder.isTypeSupported(value),
  );
  if (!type) throw new Error('当前平台暂不支持此录音格式');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: type });
    recorder.start(1000);
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onerror = () => onError('录音中断，已录制的部分仍可结束并保存。');
  let finished: Promise<RecordingProduct> | undefined;
  return {
    canPause: true,
    async pause() {
      recorder.pause();
    },
    async resume() {
      recorder.resume();
    },
    finish() {
      if (finished) return finished;
      finished = new Promise<RecordingProduct>((resolve) => {
        const complete = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          stream.getTracks().forEach((track) => track.stop());
          resolve({
            name: '录音.webm',
            blob,
            archive: (target, name) => saveNativeRecording(target, name, blob),
          });
        };
        if (recorder.state === 'inactive') complete();
        else {
          recorder.onstop = complete;
          recorder.stop();
        }
      });
      return finished;
    },
    async dispose() {
      if (recorder.state !== 'inactive') recorder.stop();
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
