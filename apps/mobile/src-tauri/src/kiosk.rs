// Kiosk basics: idle timer, fullscreen, orientation lock.
// Su iOS chiama via FFI le funzioni Swift definite in `ios/KioskPlugin.swift`.
// Su altri target i comandi sono no-op (utili in dev browser/desktop).

#[cfg(target_os = "ios")]
extern "C" {
    fn ios_set_idle_timer_disabled(disabled: bool);
    fn ios_set_fullscreen(fullscreen: bool);
    fn ios_set_orientation_lock(landscape_only: bool);
}

#[tauri::command]
pub fn set_idle_timer_disabled(disabled: bool) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    unsafe {
        ios_set_idle_timer_disabled(disabled);
    }
    let _ = disabled;
    Ok(())
}

#[tauri::command]
pub fn set_fullscreen(fullscreen: bool) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    unsafe {
        ios_set_fullscreen(fullscreen);
    }
    let _ = fullscreen;
    Ok(())
}

#[tauri::command]
pub fn set_orientation_lock(landscape_only: bool) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    unsafe {
        ios_set_orientation_lock(landscape_only);
    }
    let _ = landscape_only;
    Ok(())
}
