import AVFoundation
import Speech

protocol SpeechTask { func cancel() }
struct SpeechUpdate { let text: String; let final: Bool }
protocol SpeechEngine {
  func support(_ language: String) -> [String: Any]
  func authorize(_ completion: @escaping (Bool) -> Void)
  func recognize(_ audio: AVAudioPCMBuffer, language: String,
                 update: @escaping (SpeechUpdate?, String?) -> Void) -> SpeechTask
}
private final class AppleSpeechTask: SpeechTask {
  let task: SFSpeechRecognitionTask
  let request: SFSpeechAudioBufferRecognitionRequest
  let recognizer: SFSpeechRecognizer
  init(_ task: SFSpeechRecognitionTask, _ request: SFSpeechAudioBufferRecognitionRequest, _ recognizer: SFSpeechRecognizer) {
    self.task = task; self.request = request; self.recognizer = recognizer
  }
  func cancel() { task.cancel(); request.endAudio() }
}
final class AppleSpeechEngine: SpeechEngine {
  func support(_ language: String) -> [String: Any] {
    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language))
    let authorization: String
    switch SFSpeechRecognizer.authorizationStatus() {
    case .authorized: authorization = "authorized"
    case .denied: authorization = "denied"
    case .restricted: authorization = "restricted"
    default: authorization = "notDetermined"
    }
    return ["installed": true, "onDevice": recognizer?.supportsOnDeviceRecognition == true,
            "available": recognizer?.isAvailable == true, "authorization": authorization]
  }
  func authorize(_ completion: @escaping (Bool) -> Void) {
    SFSpeechRecognizer.requestAuthorization { completion($0 == .authorized) }
  }
  // Keep the network policy testable independently of installed language models.
  static func request() -> SFSpeechAudioBufferRecognitionRequest {
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = true
    request.taskHint = .dictation
    return request
  }
  func recognize(_ audio: AVAudioPCMBuffer, language: String,
                 update: @escaping (SpeechUpdate?, String?) -> Void) -> SpeechTask {
    let request = Self.request()
    // Apple only honors requiresOnDeviceRecognition when support is true.
    // A model that becomes unavailable must fail instead of falling back online.
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)),
          recognizer.supportsOnDeviceRecognition, recognizer.isAvailable else {
      update(nil, "speech_on_device_unavailable")
      return EmptySpeechTask()
    }
    let task = recognizer.recognitionTask(with: request) { result, error in
      if let result = result {
        update(SpeechUpdate(text: result.bestTranscription.formattedString, final: result.isFinal), nil)
      } else if let error = error as NSError? {
        if error.domain == "kAFAssistantErrorDomain" && error.code == 1110 {
          update(SpeechUpdate(text: "", final: true), nil)
        } else { update(nil, "speech_recognition_failed") }
      }
    }
    DispatchQueue.global(qos: .userInitiated).async {
      request.append(audio)
      request.endAudio()
    }
    return AppleSpeechTask(task, request, recognizer)
  }
}
struct EmptySpeechTask: SpeechTask { func cancel() {} }

/// Bounded chunks avoid the recognizer's per-request time limit. Speech receives
/// mono 16 kHz PCM; timestamps always refer to the unchanged original recording.
final class SpeechAudioFile {
  let file: AVAudioFile
  let totalSeconds: Double
  init(_ url: URL) throws {
    file = try AVAudioFile(forReading: url)
    let format = file.processingFormat
    guard file.length > 0, format.sampleRate >= 8000, format.sampleRate <= 96000,
          format.channelCount > 0, format.channelCount <= 2 else {
      throw NSError(domain: "speech_audio_invalid", code: 1)
    }
    totalSeconds = Double(file.length) / format.sampleRate
  }
  func next(seconds: Double = 45) throws -> (audio: AVAudioPCMBuffer, start: Double, end: Double)? {
    guard file.framePosition < file.length else { return nil }
    let start = Double(file.framePosition) / file.processingFormat.sampleRate
    let count = AVAudioFrameCount(min(file.length - file.framePosition,
                                    AVAudioFramePosition(file.processingFormat.sampleRate * seconds)))
    guard count > 0, let input = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: count),
          let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false),
          let converter = AVAudioConverter(from: file.processingFormat, to: format) else {
      throw NSError(domain: "speech_audio_invalid", code: 1)
    }
    try file.read(into: input, frameCount: count)
    guard input.frameLength > 0,
          let output = AVAudioPCMBuffer(pcmFormat: format,
                                      frameCapacity: AVAudioFrameCount(ceil(Double(input.frameLength) * 16000 / input.format.sampleRate)) + 64) else {
      throw NSError(domain: "speech_audio_invalid", code: 1)
    }
    var consumed = false
    var error: NSError?
    let status = converter.convert(to: output, error: &error) { _, state in
      if consumed { state.pointee = .endOfStream; return nil }
      consumed = true; state.pointee = .haveData; return input
    }
    guard error == nil, status != .error, output.frameLength > 0 else {
      throw error ?? NSError(domain: "speech_audio_invalid", code: 1)
    }
    return (output, start, min(totalSeconds, Double(file.framePosition) / file.processingFormat.sampleRate))
  }
}
