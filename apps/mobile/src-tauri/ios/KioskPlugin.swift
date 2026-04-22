// Swift bridge to UIKit for kiosk commands.
// Exposed via @_cdecl so Rust can call them through FFI.
//
// Add this file to the iOS Xcode target after `pnpm tauri ios init`.

import Foundation
import UIKit
import WebKit

/// Recursively walks the view tree looking for a WKWebView — which is the
/// one Tauri hosts the web frontend inside.
private func findWebView(in view: UIView) -> WKWebView? {
    if let web = view as? WKWebView { return web }
    for subview in view.subviews {
        if let found = findWebView(in: subview) { return found }
    }
    return nil
}

/// Make the WKWebView extend under every safe area. Without this the
/// scrollView auto-insets by the home indicator height, leaving an ugly
/// black strip (~100px on phone, ~40px on iPad) at the bottom. The HTML
/// side already handles `env(safe-area-inset-top)` explicitly, so the top
/// status-bar strip still renders correctly via CSS padding.
private func configureWebViewForFullScreen() {
    guard
        let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
        let window = scene.windows.first
    else { return }

    if let webView = findWebView(in: window) {
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.contentInset = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
        if let vc = window.rootViewController {
            vc.additionalSafeAreaInsets = .zero
        }
    }
}

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
        // Also force the WKWebView to cover the bottom safe area so iOS
        // doesn't render its own black strip under the home indicator.
        configureWebViewForFullScreen()
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
