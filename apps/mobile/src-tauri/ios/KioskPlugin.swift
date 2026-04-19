// Bridge Swift verso UIKit per i comandi kiosk.
// Esposto via @_cdecl in modo che Rust possa chiamarli via FFI.
//
// Aggiungi questo file al target Xcode iOS dopo `pnpm tauri ios init`.

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
        // iOS gestisce automaticamente la status bar via Info.plist
        // (UIStatusBarHidden), quindi qui chiediamo solo `setNeedsStatusBarAppearanceUpdate`
        // alla key window.
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
            // Forza landscape se siamo su iPad
            if UIDevice.current.userInterfaceIdiom == .pad {
                let value = UIInterfaceOrientation.landscapeLeft.rawValue
                UIDevice.current.setValue(value, forKey: "orientation")
                UIViewController.attemptRotationToDeviceOrientation()
            }
        }
    }
}
