use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    tauri_build::build();

    // On iOS, compile the Swift files into a static library that Rust
    // can link (the `@_cdecl` symbols are exposed as extern "C").
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

        compile_swift_compat_stub(&out_dir, sdk_path);

        // Compile all Swift files together into a single static library.
        let status = Command::new("swiftc")
            .args([
                "ios/KioskPlugin.swift",
                "ios/VoicePlugin.swift",
                "ios/PushPlugin.swift",
                "-emit-library",
                "-static",
                "-module-name", "IOSPlugins",
                "-target", "arm64-apple-ios17.0",
                "-sdk", sdk_path,
                "-o", &lib_path,
            ])
            .status()
            .expect("swiftc failed");

        assert!(status.success(), "Failed to compile Swift plugins");

        println!("cargo:rustc-link-search=native={out_dir}");
        println!("cargo:rustc-link-lib=static=ios_plugins");
        // Frameworks for the Swift plugins
        println!("cargo:rustc-link-lib=framework=AVFoundation");
        println!("cargo:rustc-link-lib=framework=CoreML");
        println!("cargo:rustc-link-lib=framework=Speech");
        println!("cargo:rustc-link-lib=framework=UserNotifications");
        println!("cargo:rerun-if-changed=ios/KioskPlugin.swift");
        println!("cargo:rerun-if-changed=ios/VoicePlugin.swift");
        println!("cargo:rerun-if-changed=ios/PushPlugin.swift");

        // Compile the speaker-embedding .mlpackage into the runtime
        // .mlmodelc bundle. Tauri's iOS template picks up resources from
        // gen/apple/Resources via Xcode build phases — we drop the
        // compiled model there so `Bundle.main.url(forResource:)` finds it.
        compile_speaker_model();
    }
}

// Compile ios/swift_compat_stub.c into a static archive that provides
// empty `__swift_FORCE_LOAD_$_swiftCompatibility*` symbols. swift-rs
// and Tauri's Swift glue emit references to these at compile time but
// Xcode 26's toolchain no longer ships the back-deploy archives that
// would normally satisfy them — and our iOS 17 deployment target
// makes those compat shims redundant anyway. Without this stub the
// final iOS app link fails with `Undefined symbols for architecture
// arm64: __swift_FORCE_LOAD_$_swiftCompatibility56` etc.
fn compile_swift_compat_stub(out_dir: &str, sdk_path: &str) {
    let stub_src = "ios/swift_compat_stub.c";
    let stub_obj = format!("{out_dir}/swift_compat_stub.o");
    let stub_lib = format!("{out_dir}/libswiftcompat.a");

    let status = Command::new("xcrun")
        .args([
            "clang",
            "-arch",
            "arm64",
            "-isysroot",
            sdk_path,
            "-mios-version-min=17.0",
            "-c",
            stub_src,
            "-o",
            &stub_obj,
        ])
        .status()
        .expect("clang failed");
    assert!(status.success(), "Failed to compile swift_compat_stub.c");

    let status = Command::new("ar")
        .args(["crus", &stub_lib, &stub_obj])
        .status()
        .expect("ar failed");
    assert!(status.success(), "Failed to archive swift_compat_stub.o");

    println!("cargo:rustc-link-search=native={out_dir}");
    println!("cargo:rustc-link-lib=static=swiftcompat");
    println!("cargo:rerun-if-changed={stub_src}");
}

fn compile_speaker_model() {
    let pkg = PathBuf::from("ios/Models/SpeakerECAPA.mlpackage");
    if !pkg.exists() {
        println!("cargo:warning=SpeakerECAPA.mlpackage missing — skipping speaker model");
        return;
    }
    let dest_root = PathBuf::from("gen/apple/Resources");
    if let Err(e) = std::fs::create_dir_all(&dest_root) {
        println!("cargo:warning=failed to create {}: {e}", dest_root.display());
        return;
    }
    let status = Command::new("xcrun")
        .args([
            "coremlcompiler",
            "compile",
            pkg.to_str().unwrap(),
            dest_root.to_str().unwrap(),
        ])
        .status();
    match status {
        Ok(s) if s.success() => {
            println!("cargo:rerun-if-changed=ios/Models/SpeakerECAPA.mlpackage");
        }
        Ok(s) => println!("cargo:warning=coremlcompiler exited with {s}"),
        Err(e) => println!("cargo:warning=coremlcompiler failed to spawn: {e}"),
    }
}
