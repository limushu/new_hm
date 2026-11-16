import AVFoundation
import Foundation

/// Main-queue job state. Permission and recognizer callbacks are fenced by the
/// job instance and chunk generation so canceled/old tasks cannot mutate a retry.
final class SpeechController {
  private final class Job {
    let id: String
    let audio: SpeechAudioFile
    let language: String
    var phase = "authorizing"
    var completed = 0.0
    var segments: [[String: Any]] = []
    var partial: [String: Any]?
    var error: String?
    var task: SpeechTask?
    var timer: DispatchWorkItem?
    var generation = 0
    init(id: String, audio: SpeechAudioFile, language: String) { self.id = id; self.audio = audio; self.language = language }
    func snapshot() -> [String: Any] {
      var value: [String: Any] = ["phase": phase, "totalSeconds": audio.totalSeconds,
                                 "completedSeconds": completed, "segments": segments]
      if let partial = partial { value["partial"] = partial }
      if let error = error { value["error"] = error }
      return value
    }
    deinit { timer?.cancel(); task?.cancel() }
  }
  var engine: SpeechEngine = AppleSpeechEngine()
  var chunkSeconds = 45.0
  var chunkTimeout = 120.0
  private var current: Job?
  func support(_ language: String) -> [String: Any] { engine.support(language) }
  func start(id: String, url: URL, language: String) throws -> [String: Any] {
    precondition(Thread.isMainThread)
    guard current == nil else { throw NSError(domain: "speech_busy", code: 1) }
    guard ["zh-CN", "en-US"].contains(language) else { throw NSError(domain: "speech_language_unsupported", code: 1) }
    guard engine.support(language)["onDevice"] as? Bool == true else { throw NSError(domain: "speech_on_device_unavailable", code: 1) }
    let audio: SpeechAudioFile
    do { audio = try SpeechAudioFile(url) }
    catch { throw NSError(domain: "speech_audio_invalid", code: 1) }
    let job = Job(id: id, audio: audio, language: language)
    current = job
    engine.authorize { [weak self, weak job] granted in
      DispatchQueue.main.async {
        guard let self = self, let job = job, self.current === job, job.phase == "authorizing" else { return }
        if granted { self.next(job) } else { self.fail(job, "speech_permission_denied") }
      }
    }
    return job.snapshot()
  }
  private func fail(_ job: Job, _ code: String) {
    job.generation += 1
    job.phase = "failed"; job.error = code
    job.timer?.cancel(); job.task?.cancel(); job.task = nil
  }
  private func next(_ job: Job) {
    guard current === job else { return }
    do {
      guard let chunk = try job.audio.next(seconds: chunkSeconds) else {
        job.phase = "completed"; job.completed = job.audio.totalSeconds; job.partial = nil
        return
      }
      job.phase = "transcribing"; job.generation += 1
      let generation = job.generation
      let timeout = DispatchWorkItem { [weak self, weak job] in
        guard let self = self, let job = job, self.current === job, job.generation == generation else { return }
        self.fail(job, "speech_timed_out")
      }
      job.timer = timeout
      DispatchQueue.main.asyncAfter(deadline: .now() + chunkTimeout, execute: timeout)
      job.task = engine.recognize(chunk.audio, language: job.language) { [weak self, weak job] result, error in
        DispatchQueue.main.async {
          guard let self = self, let job = job, self.current === job,
                job.phase == "transcribing", job.generation == generation else { return }
          if let error = error { self.fail(job, error); return }
          guard let result = result else { return }
          let segment: [String: Any] = ["startSeconds": chunk.start, "endSeconds": chunk.end, "text": result.text]
          if result.final {
            job.generation += 1; job.timer?.cancel(); job.task = nil; job.partial = nil
            if !result.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { job.segments.append(segment) }
            job.completed = chunk.end
            self.next(job)
          } else { job.partial = segment }
          let bytes = job.segments.reduce(0) { $0 + (($1["text"] as? String)?.utf8.count ?? 0) }
                      + ((job.partial?["text"] as? String)?.utf8.count ?? 0)
          if bytes > 2 * 1024 * 1024 { self.fail(job, "speech_result_invalid") }
        }
      }
    } catch { fail(job, "speech_audio_invalid") }
  }
  func snapshot(id: String) -> [String: Any]? { current?.id == id ? current?.snapshot() : nil }
  func cancel(id: String, error: String? = nil) -> [String: Any]? {
    guard let job = current, job.id == id else { return nil }
    if job.phase == "authorizing" || job.phase == "transcribing" {
      job.generation += 1; job.timer?.cancel(); job.task?.cancel(); job.task = nil
      job.phase = error == nil ? "canceled" : "failed"; job.error = error
    }
    return job.snapshot()
  }
  func interrupt() { if let id = current?.id { _ = cancel(id: id, error: "speech_interrupted") } }
  func discard(id: String) { guard current?.id == id else { return }; _ = cancel(id: id); current = nil }
}
