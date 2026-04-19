// Voice engine nativo: usa SFSpeechRecognizer (Apple) via Swift FFI.
//
// Flusso:
//   1. Frontend chiama `voice_start_continuous`
//   2. Rust chiama Swift `ios_voice_start_listening()` → streaming recognition
//   3. Swift rileva "ok casa" nei partial results, cattura il comando
//   4. Rust fa polling ogni 200ms con `ios_voice_poll_command()` e
//      `ios_voice_poll_status()`, ed emette eventi Tauri al frontend
//   5. Frontend riceve `voice:command` → lo parsa ed esegue
//   6. TTS via `ios_voice_speak()` per la risposta

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "ios")]
use std::ffi::{CStr, CString};

static RUNNING: AtomicBool = AtomicBool::new(false);

// --- FFI verso Swift (solo iOS) ---
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
}

// --- Tauri Commands ---

/// Richiede permesso microfono + riconoscimento vocale.
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

/// Non serve più il modello Whisper — SFSpeechRecognizer è nativo.
/// Restituisce sempre true per compatibilità col frontend.
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
    // Noop — SFSpeechRecognizer non ha bisogno di modelli da scaricare.
    Ok(())
}

#[tauri::command]
pub fn voice_init_whisper() -> Result<(), String> {
    // Noop — non usiamo più Whisper.
    Ok(())
}

/// Avvia il riconoscimento vocale streaming e un loop di polling
/// che emette eventi Tauri quando Swift rileva comandi.
#[tauri::command]
pub fn voice_start_continuous(app: AppHandle) -> Result<(), String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Err("Voice engine già attivo".into());
    }
    RUNNING.store(true, Ordering::SeqCst);

    #[cfg(target_os = "ios")]
    {
        // Avvia il riconoscimento Swift (sul main thread tramite dispatch)
        unsafe { ios_voice_start_listening() };

        // Loop di polling in background
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

                    // Poll comandi
                    let cmd_ptr = ios_voice_poll_command();
                    if !cmd_ptr.is_null() {
                        if let Ok(cmd) = CStr::from_ptr(cmd_ptr).to_str() {
                            let cmd_string = cmd.to_string();
                            if !cmd_string.is_empty() {
                                let _ = app_clone.emit("voice:command", &cmd_string);
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

/// Ferma il riconoscimento vocale.
#[tauri::command]
pub fn voice_stop_continuous() -> Result<(), String> {
    RUNNING.store(false, Ordering::SeqCst);

    #[cfg(target_os = "ios")]
    unsafe {
        ios_voice_stop_listening();
    }

    Ok(())
}

/// Cattura un singolo comando (push-to-talk).
#[tauri::command]
pub fn voice_listen(app: AppHandle, duration_secs: Option<u64>) -> Result<(), String> {
    let _ = duration_secs;
    // Per push-to-talk usiamo lo stesso meccanismo — il riconoscimento
    // streaming è già attivo, basta che l'utente parli.
    let _ = app.emit("voice:status", "listening");
    Ok(())
}

/// TTS: pronuncia il testo in italiano.
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

/// Interrompe TTS.
#[tauri::command]
pub fn voice_stop_speaking() -> Result<(), String> {
    #[cfg(target_os = "ios")]
    unsafe {
        ios_voice_stop_speaking();
    }
    Ok(())
}
