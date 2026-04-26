// Voice plugin — SFSpeechRecognizer + AVSpeechSynthesizer.
//
// RULES:
// 1. AVAudioEngine + tap are PERMANENT — never stopped
// 2. Only request + task cycle
// 3. NEVER call endAudio() during restart — only cancel()
// 4. New request assigned BEFORE cancelling the old task

import Foundation
import AVFoundation
import Speech

/// Wake words intentionally restricted to high-confidence variants only.
/// Looser matches like "oh casa" or "o casa" used to fire on Italian TV
/// dialogue ("Oh, in casa…", "ho casa…") and produced too many false
/// positives. The remaining set still covers the common ASR mishears of
/// "ok casa" without exposing the wake to ambient speech.
private let kWakeWords = ["ok casa", "okay casa", "oca sa"]

// VAD threshold in dBFS. Anything quieter than this is dropped at the
// microphone tap and never reaches SFSpeechRecognizer — this is what stops
// background TV chatter from triggering the wake word. The default leaves
// normal speech at a tablet's built-in mic well above the gate (typically
// -25 to -35 dBFS) while reliably masking ambient living-room noise.
private var gVadThresholdDbfs: Double = -45.0

// ---------------------------------------------------------------------------
// MARK: - Globals
// ---------------------------------------------------------------------------

private var gAudioEngine: AVAudioEngine?
private var gSpeechRecognizer: SFSpeechRecognizer?
private var gRecognitionRequest: SFSpeechAudioBufferRecognitionRequest?
private var gRecognitionTask: SFSpeechRecognitionTask?
private var gSynthesizer: AVSpeechSynthesizer?
private var gSpeechDelegate: SpeechDelegate?
private var gRestartTimer: Timer?
private var gWatchdogTimer: Timer?
/// Updated whenever a partial/final result lands. The watchdog uses this to
/// detect a frozen session (no callbacks for >30s while the engine is alive)
/// and force a recycle. Real silence is fine — partial results still arrive
/// every couple of hundred ms when SFSpeechRecognizer is healthy.
private var gLastPartialAt: Date = Date()
private var gIsRunning = false

/// How long without any recognition callback before we conclude that
/// SFSpeechRecognizer is stuck and force a cycle. 30s is well past the
/// typical partial-result interval (~200ms) but short enough that the user
/// only loses a single reply.
private let kWatchdogStuckSeconds: TimeInterval = 30

private var gLock = NSLock()
private var gPendingCommand: String? = nil
private var gPendingStatus: String? = nil
private var gPendingLog: String? = nil
private var gLastCmdCStr: UnsafeMutablePointer<CChar>? = nil
private var gLastStatusCStr: UnsafeMutablePointer<CChar>? = nil
private var gLastLogCStr: UnsafeMutablePointer<CChar>? = nil

private func setStatus(_ s: String) {
    gLock.lock(); gPendingStatus = s; gLock.unlock()
}
private func emitCommand(_ cmd: String) {
    gLock.lock(); gPendingCommand = cmd; gLock.unlock()
}
private func voiceLog(_ msg: String) {
    NSLog("[VOICE] %@", msg)
    gLock.lock()
    gPendingLog = (gPendingLog.map { $0 + "\n" } ?? "") + msg
    gLock.unlock()
}

// ---------------------------------------------------------------------------
// MARK: - FFI
// ---------------------------------------------------------------------------

@_cdecl("ios_voice_request_mic_permission")
public func ios_voice_request_mic_permission() -> Bool {
    let s1 = DispatchSemaphore(value: 0)
    var mic = false
    AVAudioSession.sharedInstance().requestRecordPermission { ok in mic = ok; s1.signal() }
    _ = s1.wait(timeout: .now() + 5)
    let s2 = DispatchSemaphore(value: 0)
    var speech = false
    SFSpeechRecognizer.requestAuthorization { st in speech = (st == .authorized); s2.signal() }
    _ = s2.wait(timeout: .now() + 5)
    return mic && speech
}

@_cdecl("ios_voice_start_listening")
public func ios_voice_start_listening() {
    DispatchQueue.main.async { startEngine() }
}

@_cdecl("ios_voice_stop_listening")
public func ios_voice_stop_listening() {
    DispatchQueue.main.async { stopEverything() }
}

@_cdecl("ios_voice_poll_command")
public func ios_voice_poll_command() -> UnsafePointer<CChar>? {
    gLock.lock(); defer { gLock.unlock() }
    guard let cmd = gPendingCommand else { return nil }
    free(gLastCmdCStr); gLastCmdCStr = strdup(cmd); gPendingCommand = nil
    return UnsafePointer(gLastCmdCStr)
}

@_cdecl("ios_voice_poll_status")
public func ios_voice_poll_status() -> UnsafePointer<CChar>? {
    gLock.lock(); defer { gLock.unlock() }
    guard let s = gPendingStatus else { return nil }
    free(gLastStatusCStr); gLastStatusCStr = strdup(s); gPendingStatus = nil
    return UnsafePointer(gLastStatusCStr)
}

@_cdecl("ios_voice_poll_log")
public func ios_voice_poll_log() -> UnsafePointer<CChar>? {
    gLock.lock(); defer { gLock.unlock() }
    guard let l = gPendingLog else { return nil }
    free(gLastLogCStr); gLastLogCStr = strdup(l); gPendingLog = nil
    return UnsafePointer(gLastLogCStr)
}

// ---------------------------------------------------------------------------
// MARK: - Engine (permanent)
// ---------------------------------------------------------------------------

private func startEngine() {
    guard !gIsRunning else { return }
    guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
        setStatus("error"); return
    }
    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "it-IT"))
    guard let recognizer = recognizer, recognizer.isAvailable else {
        setStatus("error"); return
    }
    gSpeechRecognizer = recognizer

    let session = AVAudioSession.sharedInstance()
    do {
        try session.setCategory(.playAndRecord, mode: .default,
                                options: [.defaultToSpeaker, .allowBluetooth])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
    } catch {
        voiceLog("audio session error: \(error)")
        setStatus("error"); return
    }

    let engine = AVAudioEngine()
    gAudioEngine = engine
    let format = engine.inputNode.outputFormat(forBus: 0)

    // PERMANENT tap
    engine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        // Reads the global each time — when nil the buffers are dropped (OK)
        guard let request = gRecognitionRequest else { return }
        // VAD gate: drop buffers below the configured dBFS threshold so quiet
        // background chatter (TV in another room, fridge hum) never reaches
        // the recognizer. We deliberately silence-skip rather than feed
        // attenuated audio: SFSpeechRecognizer behaves better when fed only
        // intervals it can actually transcribe.
        if bufferDbfs(buffer) < gVadThresholdDbfs { return }
        request.append(buffer)
    }

    engine.prepare()
    do { try engine.start() } catch {
        voiceLog("engine start error: \(error)")
        setStatus("error"); return
    }

    gIsRunning = true
    setStatus("idle")
    voiceLog("engine started")
    startRecognitionSession()
}

private func stopEverything() {
    gIsRunning = false
    gRestartTimer?.invalidate(); gRestartTimer = nil
    gWatchdogTimer?.invalidate(); gWatchdogTimer = nil
    // For TOTAL shutdown we use endAudio (graceful)
    gRecognitionRequest?.endAudio()
    gRecognitionRequest = nil
    gRecognitionTask?.cancel()
    gRecognitionTask = nil
    gAudioEngine?.stop()
    gAudioEngine?.inputNode.removeTap(onBus: 0)
    gAudioEngine = nil
    gSpeechRecognizer = nil
    setStatus("disabled")
    do { try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) } catch {}
    voiceLog("stopped everything")
}

// ---------------------------------------------------------------------------
// MARK: - Recognition session
// ---------------------------------------------------------------------------

private func startRecognitionSession() {
    guard gIsRunning, let recognizer = gSpeechRecognizer else { return }

    gRestartTimer?.invalidate()
    gWatchdogTimer?.invalidate()
    /* Reset the last-callback marker at session start: a fresh session is
     * "alive" by definition, so the watchdog should give it the full grace
     * window before deciding it's stuck. */
    gLastPartialAt = Date()

    // RULE: new request FIRST, cancel old task AFTER.
    // This way the tap always has a valid destination.
    let newRequest = SFSpeechAudioBufferRecognitionRequest()
    newRequest.shouldReportPartialResults = true
    if #available(iOS 13, *) {
        if recognizer.supportsOnDeviceRecognition {
            newRequest.requiresOnDeviceRecognition = true
        }
    }

    // Atomic swap
    let oldTask = gRecognitionTask
    let oldRequest = gRecognitionRequest
    gRecognitionRequest = newRequest  // tap starts sending here
    gRecognitionTask = nil

    // RULE: only cancel(), NEVER endAudio() during restart
    oldTask?.cancel()
    _ = oldRequest  // let ARC deallocate it

    var heardWake = false
    var lastText = ""
    var lastChangeTime = Date()
    var silenceTimer: Timer? = nil

    voiceLog("session started")

    // Guard: this request is "ours". If a callback arrives for
    // an old request, we ignore it.
    let thisRequest = newRequest

    gRecognitionTask = recognizer.recognitionTask(with: newRequest) { result, error in
        // Ignore stale callbacks
        guard gRecognitionRequest === thisRequest else { return }

        // Any callback (partial result, final, or even an error) is proof
        // the session is alive — bump the marker so the watchdog stays calm.
        gLastPartialAt = Date()

        if let result = result {
            let original = result.bestTranscription.formattedString
            let lower = original.lowercased()

            if original != lastText {
                lastText = original
                lastChangeTime = Date()
            }

            voiceLog("'\(original)'")

            // Look for the wake word
            var wakeEnd: String.Index? = nil
            for ww in kWakeWords {
                if let range = lower.range(of: ww) {
                    let offset = lower.distance(from: lower.startIndex, to: range.upperBound)
                    wakeEnd = original.index(original.startIndex, offsetBy: min(offset, original.count))
                    break
                }
            }

            if wakeEnd != nil && !heardWake {
                heardWake = true
                voiceLog("WAKE!")
                setStatus("listening")

                silenceTimer?.invalidate()
                silenceTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { timer in
                    guard gRecognitionRequest === thisRequest else {
                        timer.invalidate(); return
                    }
                    let elapsed = Date().timeIntervalSince(lastChangeTime)
                    if elapsed >= 1.5 {
                        timer.invalidate(); silenceTimer = nil
                        let curLower = lastText.lowercased()
                        var endIdx: String.Index? = nil
                        for ww in kWakeWords {
                            if let r = curLower.range(of: ww) {
                                let off = curLower.distance(from: curLower.startIndex, to: r.upperBound)
                                endIdx = lastText.index(lastText.startIndex, offsetBy: min(off, lastText.count))
                                break
                            }
                        }
                        let cmd = endIdx.map { String(lastText[$0...])
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                            .trimmingCharacters(in: .punctuationCharacters)
                            .trimmingCharacters(in: .whitespaces) } ?? ""

                        voiceLog("CMD: '\(cmd)'")
                        if cmd.count > 2 {
                            emitCommand(cmd)
                            setStatus("processing")
                        } else {
                            setStatus("idle")
                        }
                        heardWake = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                            if gIsRunning { startRecognitionSession() }
                        }
                    }
                }
            }

            if result.isFinal {
                silenceTimer?.invalidate(); silenceTimer = nil
                heardWake = false
                DispatchQueue.main.async {
                    if gIsRunning { startRecognitionSession() }
                }
            }
        } else if let error = error {
            let nsErr = error as NSError
            silenceTimer?.invalidate(); silenceTimer = nil

            // 203 = cancelled by us — expected and ignored
            if nsErr.code == 203 { return }

            voiceLog("err \(nsErr.code)")
            heardWake = false

            // 1110 = no speech: NORMAL if the user is silent.
            // FAST restart (0.3s) — long delays make it worse.
            let delay: TimeInterval = (nsErr.code == 1110) ? 0.3 : 1.0
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                if gIsRunning { startRecognitionSession() }
            }
        }
    }

    // 55s timer to recycle before Apple's ~60s limit
    gRestartTimer = Timer.scheduledTimer(withTimeInterval: 55, repeats: false) { _ in
        if gIsRunning {
            voiceLog("55s recycle")
            startRecognitionSession()
        }
    }

    /* Watchdog: SFSpeechRecognizer occasionally gets stuck without ever
     * calling back — no partial results, no error, the request just goes
     * silent. The 55s recycle masked this for the first minute, but when
     * a stuck session lasts longer than that the user has to restart the
     * app. We sample every 10s and force-cycle when a healthy session
     * would have produced at least one callback. */
    gWatchdogTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { timer in
        guard gIsRunning, gRecognitionRequest === thisRequest else {
            timer.invalidate(); return
        }
        let stuck = Date().timeIntervalSince(gLastPartialAt)
        if stuck >= kWatchdogStuckSeconds {
            voiceLog("watchdog: stuck \(Int(stuck))s, force-cycle")
            timer.invalidate()
            startRecognitionSession()
        }
    }
}

// ---------------------------------------------------------------------------
// MARK: - TTS
// ---------------------------------------------------------------------------

private class SpeechDelegate: NSObject, AVSpeechSynthesizerDelegate {
    var onFinish: (() -> Void)?
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) { onFinish?() }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) { onFinish?() }
}

private func preferredItalianVoice() -> AVSpeechSynthesisVoice? {
    let v = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("it") }
    return v.first(where: { $0.name.lowercased().contains("federica") })
        ?? v.first(where: { $0.name.lowercased().contains("alice") && $0.quality == .enhanced })
        ?? v.first(where: { $0.quality != .default })
        ?? v.first ?? AVSpeechSynthesisVoice(language: "it-IT")
}

@_cdecl("ios_voice_speak")
public func ios_voice_speak(_ text: UnsafePointer<CChar>) {
    let s = String(cString: text)
    guard !s.isEmpty else { return }
    DispatchQueue.main.async {
        voiceLog("TTS: '\(s)'")

        // RULE: only cancel(), NEVER endAudio()
        // Nil the request so the tap sends buffers to nil (dropped, OK)
        gRecognitionRequest = nil
        gRecognitionTask?.cancel()
        gRecognitionTask = nil
        gRestartTimer?.invalidate(); gRestartTimer = nil
        gWatchdogTimer?.invalidate(); gWatchdogTimer = nil

        if gSynthesizer == nil { gSynthesizer = AVSpeechSynthesizer() }
        if gSpeechDelegate == nil { gSpeechDelegate = SpeechDelegate() }
        let synth = gSynthesizer!
        synth.delegate = gSpeechDelegate
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }

        gSpeechDelegate!.onFinish = {
            voiceLog("TTS done, restart recognition")
            // Brief delay — do NOT reconfigure the audio session
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                if gIsRunning {
                    startRecognitionSession()
                    setStatus("idle")
                }
            }
        }

        let utt = AVSpeechUtterance(string: s)
        utt.voice = preferredItalianVoice()
        utt.rate = AVSpeechUtteranceDefaultSpeechRate
        utt.volume = 1.0
        synth.speak(utt)
    }
}

@_cdecl("ios_voice_stop_speaking")
public func ios_voice_stop_speaking() {
    DispatchQueue.main.async { gSynthesizer?.stopSpeaking(at: .immediate) }
}

/// Sensitivity slider 0.0..1.0 maps linearly onto a dBFS gate.
///
/// `level=0`  → -25 dBFS (only loud, close speech passes — useful when the
///              TV is on or the room is noisy)
/// `level=1`  → -55 dBFS (whisper-friendly, accepts almost anything)
/// `level=0.8` (default) → -49 dBFS — comfortable for normal speech without
///              picking up living-room TV at typical volumes.
@_cdecl("ios_voice_set_sensitivity")
public func ios_voice_set_sensitivity(_ level: Double) {
    let clamped = max(0.0, min(1.0, level))
    let threshold = -25.0 - clamped * 30.0
    gVadThresholdDbfs = threshold
    voiceLog("VAD threshold set to \(Int(threshold)) dBFS (sensitivity=\(clamped))")
}

/// Compute RMS of an audio buffer in dBFS. Returns -160 for an empty buffer
/// or a fully-silent frame so the caller can compare against the threshold
/// without special-casing zero.
private func bufferDbfs(_ buffer: AVAudioPCMBuffer) -> Double {
    let frames = Int(buffer.frameLength)
    guard frames > 0, let channelData = buffer.floatChannelData?[0] else { return -160.0 }
    var sumSquares: Double = 0
    for i in 0..<frames {
        let sample = Double(channelData[i])
        sumSquares += sample * sample
    }
    let rms = sqrt(sumSquares / Double(frames))
    if rms < 1e-9 { return -160.0 }
    return 20 * log10(rms)
}

@_cdecl("ios_voice_is_speaking")
public func ios_voice_is_speaking() -> Bool {
    return gSynthesizer?.isSpeaking ?? false
}
