// APNs push notification plugin.
//
// Flow:
//   1. JS calls invoke('push_request_permission')
//   2. Rust → Swift `ios_push_request_permission()` asks the user
//   3. On grant, Swift installs a method-swizzle on the existing
//      Tauri AppDelegate to catch
//      `application:didRegisterForRemoteNotificationsWithDeviceToken:`,
//      then calls `UIApplication.shared.registerForRemoteNotifications()`
//   4. APNs hands iOS a device token, AppDelegate forwards it via the
//      injected method, Swift captures it in a global
//   5. JS polls `invoke('push_get_token')` until the token shows up
//      and POSTs it to `/api/v1/push/register`
//
// Why method swizzling: Tauri's AppDelegate is generated and we don't
// want to fork it. `class_addMethod` is the lightest hook — it only
// adds the implementation if the delegate doesn't already expose
// the selector (Tauri's doesn't, today).

import Foundation
import UIKit
import UserNotifications
import ObjectiveC.runtime

private var gPushToken: String?
private let gPushLock = NSLock()
private var gPushDelegate: PushNotificationDelegate?
private var gSwizzleInstalled = false

private class PushNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    /// Show the banner + play the sound even when the app is open in
    /// the foreground — that's the primary use case for the panel.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .list, .sound, .badge])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }

    /// Tap on a notification — currently a no-op, the panel reacts to
    /// SSE state already. We could deep-link into the alarm event in
    /// the future via `userInfo["eventId"]`.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }
}

private func installSwizzleAndRegister() {
    if !gSwizzleInstalled, let delegate = UIApplication.shared.delegate {
        let cls: AnyClass = type(of: delegate)

        let didRegisterSel = NSSelectorFromString(
            "application:didRegisterForRemoteNotificationsWithDeviceToken:"
        )
        let didFailSel = NSSelectorFromString(
            "application:didFailToRegisterForRemoteNotificationsWithError:"
        )

        let didRegisterBlock: @convention(block) (AnyObject, UIApplication, Data) -> Void = {
            _, _, deviceToken in
            let token = deviceToken.map { String(format: "%02x", $0) }.joined()
            gPushLock.lock()
            gPushToken = token
            gPushLock.unlock()
            NSLog("[push] APNs token captured (\(String(token.prefix(8)))…)")
        }
        let didRegisterImp = imp_implementationWithBlock(didRegisterBlock)
        class_addMethod(cls, didRegisterSel, didRegisterImp, "v@:@@")

        let didFailBlock: @convention(block) (AnyObject, UIApplication, NSError) -> Void = {
            _, _, err in
            NSLog("[push] APNs registration failed: \(err.localizedDescription)")
        }
        let didFailImp = imp_implementationWithBlock(didFailBlock)
        class_addMethod(cls, didFailSel, didFailImp, "v@:@@")

        gPushDelegate = PushNotificationDelegate()
        UNUserNotificationCenter.current().delegate = gPushDelegate

        gSwizzleInstalled = true
    }
    UIApplication.shared.registerForRemoteNotifications()
}

/// Asks the user for notification permission. Returns true if granted.
/// Synchronous from Rust's perspective via a semaphore — APNs auth
/// dialog typically resolves in milliseconds, but we cap the wait at
/// 30 seconds.
@_cdecl("ios_push_request_permission")
public func ios_push_request_permission() -> Bool {
    let semaphore = DispatchSemaphore(value: 0)
    var grantedResult = false
    UNUserNotificationCenter.current()
        .requestAuthorization(options: [.alert, .sound, .badge]) { ok, _ in
            grantedResult = ok
            semaphore.signal()
        }
    _ = semaphore.wait(timeout: .now() + 30)
    if grantedResult {
        DispatchQueue.main.async {
            installSwizzleAndRegister()
        }
    }
    return grantedResult
}

/// Returns the captured APNs token, or NULL if not yet available.
/// Caller must `free()` the returned pointer (Rust's `CString::from_raw`
/// handles that).
@_cdecl("ios_push_poll_token")
public func ios_push_poll_token() -> UnsafeMutablePointer<CChar>? {
    gPushLock.lock()
    defer { gPushLock.unlock() }
    guard let t = gPushToken else { return nil }
    return strdup(t)
}

/// Returns the current notification authorization status as an int:
///   0 = not determined
///   1 = denied
///   2 = authorized
///   3 = provisional
///   4 = ephemeral
@_cdecl("ios_push_authorization_status")
public func ios_push_authorization_status() -> Int32 {
    let semaphore = DispatchSemaphore(value: 0)
    var result: Int32 = 0
    UNUserNotificationCenter.current().getNotificationSettings { settings in
        switch settings.authorizationStatus {
        case .notDetermined: result = 0
        case .denied: result = 1
        case .authorized: result = 2
        case .provisional: result = 3
        case .ephemeral: result = 4
        @unknown default: result = 0
        }
        semaphore.signal()
    }
    _ = semaphore.wait(timeout: .now() + 5)
    return result
}
