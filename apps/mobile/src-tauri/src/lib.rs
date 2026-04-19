// Home Panel — Tauri 2 entry point.
// Mobile target: iPad/iPhone via `tauri ios`.

mod kiosk;
mod voice;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            kiosk::set_idle_timer_disabled,
            kiosk::set_fullscreen,
            kiosk::set_orientation_lock,
            voice::voice_request_permission,
            voice::voice_model_path,
            voice::voice_model_exists,
            voice::voice_download_model,
            voice::voice_init_whisper,
            voice::voice_listen,
            voice::voice_start_continuous,
            voice::voice_stop_continuous,
            voice::voice_speak,
            voice::voice_stop_speaking,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
