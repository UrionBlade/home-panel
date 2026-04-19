use std::env;
use std::process::Command;

fn main() {
    tauri_build::build();

    // Su iOS, compila i file Swift in una libreria statica che Rust
    // può linkare (i simboli `@_cdecl` vengono esposti come extern "C").
    let target = env::var("TARGET").unwrap_or_default();
    if target.contains("apple-ios") && !target.contains("sim") {
        let sdk = "iphoneos";
        let out_dir = env::var("OUT_DIR").unwrap();
        let lib_path = format!("{out_dir}/libios_plugins.a");

        let sdk_path = String::from_utf8(
            Command::new("xcrun")
                .args(["--sdk", sdk, "--show-sdk-path"])
                .output()
                .expect("xcrun failed")
                .stdout,
        )
        .unwrap();
        let sdk_path = sdk_path.trim();

        // Compila tutti i file Swift insieme in una singola libreria statica.
        let status = Command::new("swiftc")
            .args([
                "ios/KioskPlugin.swift",
                "ios/VoicePlugin.swift",
                "-emit-library",
                "-static",
                "-module-name", "IOSPlugins",
                "-target", "arm64-apple-ios14.0",
                "-sdk", sdk_path,
                "-o", &lib_path,
            ])
            .status()
            .expect("swiftc failed");

        assert!(status.success(), "Failed to compile Swift plugins");

        println!("cargo:rustc-link-search=native={out_dir}");
        println!("cargo:rustc-link-lib=static=ios_plugins");
        // Frameworks per i plugin Swift
        println!("cargo:rustc-link-lib=framework=AVFoundation");
        println!("cargo:rustc-link-lib=framework=Speech");
        println!("cargo:rerun-if-changed=ios/KioskPlugin.swift");
        println!("cargo:rerun-if-changed=ios/VoicePlugin.swift");
    }
}
