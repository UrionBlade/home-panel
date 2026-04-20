// Swift bridge to UIKit for kiosk commands.
// Exposed via @_cdecl so Rust can call them through FFI.
//
// Add this file to the iOS Xcode target after `pnpm tauri ios init`.

import Foundation
import UIKit

@_cdecl("ios_set_idle_timer_disabled")
public func ios_set_idle_timer_disabled(_ disabled: Bool) {
    DispatchQueue.main.async {
        UIApplication.shared.isIdleTimerDisabled = disabled
    }
}

@_cdecl("ios_set_fullscreen")
public func ios_set_fullscreen(_ fullscreen: Bool) {
    DispatchQueue.main.async {
        // iOS handles the status bar automatically via Info.plist
        // (UIStatusBarHidden), so here we just ask the key window for
        // `setNeedsStatusBarAppearanceUpdate`.
        if let scene = UIApplication.shared.connectedScenes
            .first as? UIWindowScene,
            let window = scene.windows.first,
            let rootVC = window.rootViewController {
            rootVC.setNeedsStatusBarAppearanceUpdate()
        }
        _ = fullscreen
    }
}

@_cdecl("ios_set_orientation_lock")
public func ios_set_orientation_lock(_ landscapeOnly: Bool) {
    DispatchQueue.main.async {
        if landscapeOnly {
            // Force landscape when running on iPad
            if UIDevice.current.userInterfaceIdiom == .pad {
                let value = UIInterfaceOrientation.landscapeLeft.rawValue
                UIDevice.current.setValue(value, forKey: "orientation")
                UIViewController.attemptRotationToDeviceOrientation()
            }
        }
    }
}
