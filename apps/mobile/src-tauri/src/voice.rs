// Native voice engine: uses SFSpeechRecognizer (Apple) via Swift FFI.
//
// Flow:
//   1. Frontend calls `voice_start_continuous`
//   2. Rust calls Swift `ios_voice_start_listening()` → streaming recognition
//   3. Swift detects "ok casa" in partial results, captures the command
//   4. Rust polls every 200ms with `ios_voice_poll_command()` and
//      `ios_voice_poll_status()`, and emits Tauri events to the frontend
//   5. Frontend receives `voice:command` → parses and executes it
//   6. TTS via `ios_voice_speak()` for the response

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "ios")]
use std::ffi::{CStr, CString};
#[cfg(target_os = "ios")]
use std::sync::Mutex;

static RUNNING: AtomicBool = AtomicBool::new(false);

/// Most recent speaker embedding produced by the iOS plugin. Drained when
/// a command is emitted so the same vector isn't re-attached to the next
/// command if the user asks something during the embedding's grace window.
#[cfg(target_os = "ios")]
static LAST_EMBEDDING: Mutex<Option<Vec<f32>>> = Mutex::new(None);

// --- FFI to Swift (iOS only) ---
#[cfg(target_os = "ios")]
extern "C" {
    fn ios_voice_request_mic_permission() -> bool;
    fn ios_voice_start_listening();
    fn ios_voice_stop_listening();
    fn ios_voice_poll_command() -> *const std::os::raw::c_char;
    fn ios_voice_poll_status() -> *const std::os::raw::c_char;
    fn ios_voice_speak(text: *const std::os::raw::c_char);
    fn ios_voice_stop_speaking();
    fn ios_voice_poll_log() -> *const std::os::raw::c_char;
    fn ios_voice_set_sensitivity(level: std::os::raw::c_double);
    fn ios_voice_poll_embedding() -> *const std::os::raw::c_float;
    fn ios_voice_begin_enrollment_capture();
    fn ios_voice_poll_enrollment_embedding() -> *const std::os::raw::c_float;
}

/// Length of the speaker embedding emitted by `ios_voice_poll_embedding`.
/// Must match `kSpeakerEmbeddingDim` in VoicePlugin.swift (192 for the
/// shipped ECAPA-TDNN model).
#[cfg(target_os = "ios")]
const SPEAKER_EMBEDDING_DIM: usize = 192;

// --- Tauri Commands ---

/// Requests microphone + speech recognition permission.
#[tauri::command]
pub async fn voice_request_permission() -> Result<bool, String> {
    #[cfg(target_os = "ios")]
    {
        let result = tokio::task::spawn_blocking(|| unsafe {
            ios_voice_request_mic_permission()
        })
        .await
        .map_err(|e| e.to_string())?;
        Ok(result)
    }
    #[cfg(not(target_os = "ios"))]
    {
        Ok(false)
    }
}

/// Whisper model is no longer needed — SFSpeechRecognizer is native.
/// Always returns true for frontend compatibility.
#[tauri::command]
pub fn voice_model_exists() -> Result<bool, String> {
    Ok(true)
}

#[tauri::command]
pub fn voice_model_path() -> Result<String, String> {
    Ok("native".to_string())
}

#[tauri::command]
pub async fn voice_download_model() -> Result<(), String> {
    // Noop — SFSpeechRecognizer does not need any models to download.
    Ok(())
}

#[tauri::command]
pub fn voice_init_whisper() -> Result<(), String> {
    // Noop — Whisper is no longer used.
    Ok(())
}

/// Starts streaming speech recognition and a polling loop
/// that emits Tauri events when Swift detects commands.
#[tauri::command]
pub fn voice_start_continuous(app: AppHandle) -> Result<(), String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Err("Voice engine già attivo".into());
    }
    RUNNING.store(true, Ordering::SeqCst);

    #[cfg(target_os = "ios")]
    {
        // Start Swift recognition (on main thread via dispatch)
        unsafe { ios_voice_start_listening() };

        // Background polling loop
        let app_clone = app.clone();
        std::thread::spawn(move || {
            while RUNNING.load(Ordering::SeqCst) {
                // Poll status changes
                unsafe {
                    let status_ptr = ios_voice_poll_status();
                    if !status_ptr.is_null() {
                        if let Ok(s) = CStr::from_ptr(status_ptr).to_str() {
                            let _ = app_clone.emit("voice:status", s);
                        }
                    }

                    // Poll log (debug)
                    let log_ptr = ios_voice_poll_log();
                    if !log_ptr.is_null() {
                        if let Ok(log) = CStr::from_ptr(log_ptr).to_str() {
                            let _ = app_clone.emit("voice:log", log);
                        }
                    }

                    // Poll embeddings: cache the latest into LAST_EMBEDDING
                    // so the command emit below can attach it. The buffer
                    // is owned by the Swift side; copy out before returning.
                    let emb_ptr = ios_voice_poll_embedding();
                    if !emb_ptr.is_null() {
                        let slice = std::slice::from_raw_parts(emb_ptr, SPEAKER_EMBEDDING_DIM);
                        let vec: Vec<f32> = slice.to_vec();
                        if let Ok(mut guard) = LAST_EMBEDDING.lock() {
                            *guard = Some(vec);
                        }
                    }

                    // Poll commands
                    let cmd_ptr = ios_voice_poll_command();
                    if !cmd_ptr.is_null() {
                        if let Ok(cmd) = CStr::from_ptr(cmd_ptr).to_str() {
                            let cmd_string = cmd.to_string();
                            if !cmd_string.is_empty() {
                                /* Drain the cached embedding so it's attached
                                 * to this command and not the next one. May
                                 * be `None` if the model isn't loaded or the
                                 * 2.5 s capture window hasn't completed yet. */
                                let embedding = LAST_EMBEDDING
                                    .lock()
                                    .ok()
                                    .and_then(|mut g| g.take());
                                let payload = serde_json::json!({
                                    "command": cmd_string,
                                    "embedding": embedding,
                                });
                                let _ = app_clone.emit("voice:command", payload);
                            }
                        }
                    }
                }

                std::thread::sleep(std::time::Duration::from_millis(200));
            }
        });
    }

    #[cfg(not(target_os = "ios"))]
    {
        let _ = app;
        RUNNING.store(false, Ordering::SeqCst);
    }

    Ok(())
}

/// Stops speech recognition.
#[tauri::command]
pub fn voice_stop_continuous() -> Result<(), String> {
    RUNNING.store(false, Ordering::SeqCst);

    #[cfg(target_os = "ios")]
    unsafe {
        ios_voice_stop_listening();
    }

    Ok(())
}

/// Captures a single command (push-to-talk).
#[tauri::command]
pub fn voice_listen(app: AppHandle, duration_secs: Option<u64>) -> Result<(), String> {
    let _ = duration_secs;
    // For push-to-talk we use the same mechanism — streaming recognition
    // is already active, the user just needs to speak.
    let _ = app.emit("voice:status", "listening");
    Ok(())
}

/// TTS: speaks the given text in Italian.
#[tauri::command]
pub fn voice_speak(text: String) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        let c_text = CString::new(text).map_err(|e| e.to_string())?;
        unsafe { ios_voice_speak(c_text.as_ptr()) };
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = text;
    }
    Ok(())
}

/// Stops TTS.
#[tauri::command]
pub fn voice_stop_speaking() -> Result<(), String> {
    #[cfg(target_os = "ios")]
    unsafe {
        ios_voice_stop_speaking();
    }
    Ok(())
}

/// Capture a single 2.5 s clip and return the speaker embedding the
/// CoreML model emits for it. Used by the enrollment UI in family
/// settings — the user holds a "record" button and we slice that
/// window. Times out after 4 s if the model never produces a vector
/// (e.g. the device never gathered enough audio, or the .mlmodelc is
/// missing from the bundle).
#[tauri::command]
pub async fn voice_capture_speaker_embedding() -> Result<Vec<f32>, String> {
    #[cfg(target_os = "ios")]
    {
        use std::time::{Duration, Instant};
        unsafe { ios_voice_begin_enrollment_capture() };
        let deadline = Instant::now() + Duration::from_secs(4);
        loop {
            unsafe {
                let p = ios_voice_poll_enrollment_embedding();
                if !p.is_null() {
                    let slice = std::slice::from_raw_parts(p, SPEAKER_EMBEDDING_DIM);
                    return Ok(slice.to_vec());
                }
            }
            if Instant::now() > deadline {
                return Err(
                    "timeout: nessun campione audio sufficiente nei 4s".to_string()
                );
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }
    #[cfg(not(target_os = "ios"))]
    {
        Err("speaker embedding richiede iOS nativo".into())
    }
}

/// Forwards the user-configured sensitivity slider (0..1) to the Swift VAD
/// gate. The frontend syncs this on boot and on every slider change.
#[tauri::command]
pub fn voice_set_sensitivity(level: f64) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    unsafe {
        ios_voice_set_sensitivity(level);
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = level;
    }
    Ok(())
}
