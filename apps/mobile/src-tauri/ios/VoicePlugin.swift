// Voice plugin — SFSpeechRecognizer + AVSpeechSynthesizer.
//
// REGOLE:
// 1. AVAudioEngine + tap PERMANENTI — mai fermati
// 2. Solo request + task ciclano
// 3. MAI chiamare endAudio() durante restart — solo cancel()
// 4. Nuova request assegnata PRIMA di cancellare il vecchio task

import Foundation
import AVFoundation
import Speech

private let kWakeWords = ["ok casa", "okay casa", "oca sa", "oh casa", "o casa"]

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
private var gIsRunning = false

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
// MARK: - Engine (permanente)
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

    // Tap PERMANENTE
    engine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        // Legge il global ogni volta — quando è nil i buffer vanno persi (OK)
        gRecognitionRequest?.append(buffer)
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
    // Per lo shutdown TOTALE usiamo endAudio (graceful)
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

    // REGOLA: nuova request PRIMA, cancel vecchio task DOPO.
    // Così il tap ha sempre una destinazione valida.
    let newRequest = SFSpeechAudioBufferRecognitionRequest()
    newRequest.shouldReportPartialResults = true
    if #available(iOS 13, *) {
        if recognizer.supportsOnDeviceRecognition {
            newRequest.requiresOnDeviceRecognition = true
        }
    }

    // Swap atomico
    let oldTask = gRecognitionTask
    let oldRequest = gRecognitionRequest
    gRecognitionRequest = newRequest  // tap inizia a mandare qui
    gRecognitionTask = nil

    // REGOLA: solo cancel(), MAI endAudio() durante restart
    oldTask?.cancel()
    _ = oldRequest  // lascia che ARC lo deallochi

    var heardWake = false
    var lastText = ""
    var lastChangeTime = Date()
    var silenceTimer: Timer? = nil

    voiceLog("session started")

    // Guard: questa request è "la nostra". Se arriva un callback per
    // una request vecchia, lo ignoriamo.
    let thisRequest = newRequest

    gRecognitionTask = recognizer.recognitionTask(with: newRequest) { result, error in
        // Ignora callback stale
        guard gRecognitionRequest === thisRequest else { return }

        if let result = result {
            let original = result.bestTranscription.formattedString
            let lower = original.lowercased()

            if original != lastText {
                lastText = original
                lastChangeTime = Date()
            }

            voiceLog("'\(original)'")

            // Cerca wake word
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

            // 203 = cancelled by us — atteso e ignorato
            if nsErr.code == 203 { return }

            voiceLog("err \(nsErr.code)")
            heardWake = false

            // 1110 = no speech: NORMALE se l'utente è in silenzio.
            // Restart VELOCE (0.3s) — delay lunghi peggiorano.
            let delay: TimeInterval = (nsErr.code == 1110) ? 0.3 : 1.0
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                if gIsRunning { startRecognitionSession() }
            }
        }
    }

    // Timer 55s per riciclare prima del limite Apple di ~60s
    gRestartTimer = Timer.scheduledTimer(withTimeInterval: 55, repeats: false) { _ in
        if gIsRunning {
            voiceLog("55s recycle")
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

        // REGOLA: solo cancel(), MAI endAudio()
        // Nil la request così il tap manda buffer a nil (persi, OK)
        gRecognitionRequest = nil
        gRecognitionTask?.cancel()
        gRecognitionTask = nil
        gRestartTimer?.invalidate(); gRestartTimer = nil

        if gSynthesizer == nil { gSynthesizer = AVSpeechSynthesizer() }
        if gSpeechDelegate == nil { gSpeechDelegate = SpeechDelegate() }
        let synth = gSynthesizer!
        synth.delegate = gSpeechDelegate
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }

        gSpeechDelegate!.onFinish = {
            voiceLog("TTS done, restart recognition")
            // Delay breve — NON riconfigurare audio session
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

@_cdecl("ios_voice_is_speaking")
public func ios_voice_is_speaking() -> Bool {
    return gSynthesizer?.isSpeaking ?? false
}
