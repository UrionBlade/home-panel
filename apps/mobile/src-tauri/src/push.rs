// APNs push notification bridge — talks to Swift `PushPlugin.swift`.
//
// Only iOS has a real implementation; on macOS/Linux the commands are
// no-ops so the panel still builds for desktop dev.

#[cfg(target_os = "ios")]
use std::ffi::CStr;

#[cfg(target_os = "ios")]
extern "C" {
    fn ios_push_request_permission() -> bool;
    fn ios_push_poll_token() -> *mut std::os::raw::c_char;
    fn ios_push_authorization_status() -> i32;
}

#[tauri::command]
pub async fn push_request_permission() -> Result<bool, String> {
    #[cfg(target_os = "ios")]
    {
        let granted = tokio::task::spawn_blocking(|| unsafe { ios_push_request_permission() })
            .await
            .map_err(|e| e.to_string())?;
        Ok(granted)
    }
    #[cfg(not(target_os = "ios"))]
    {
        Ok(false)
    }
}

/// Returns the APNs device token if available, or None while waiting.
/// The mobile app polls this on a short interval after requesting
/// permission until the system delivers the token (typically <1s).
#[tauri::command]
pub fn push_get_token() -> Result<Option<String>, String> {
    #[cfg(target_os = "ios")]
    unsafe {
        let ptr = ios_push_poll_token();
        if ptr.is_null() {
            return Ok(None);
        }
        let s = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        // Free the C-string Swift `strdup`-ed for us.
        libc::free(ptr as *mut libc::c_void);
        Ok(Some(s))
    }
    #[cfg(not(target_os = "ios"))]
    {
        Ok(None)
    }
}

/// Returns the current authorization status:
///   "not_determined" | "denied" | "authorized" | "provisional"
///   | "ephemeral"
#[tauri::command]
pub fn push_authorization_status() -> Result<String, String> {
    #[cfg(target_os = "ios")]
    {
        let code = unsafe { ios_push_authorization_status() };
        Ok(match code {
            0 => "not_determined".to_string(),
            1 => "denied".to_string(),
            2 => "authorized".to_string(),
            3 => "provisional".to_string(),
            4 => "ephemeral".to_string(),
            _ => "not_determined".to_string(),
        })
    }
    #[cfg(not(target_os = "ios"))]
    {
        Ok("denied".to_string())
    }
}
