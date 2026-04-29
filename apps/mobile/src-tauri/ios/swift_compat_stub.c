// Stub the Swift back-deploy compatibility "FORCE_LOAD" symbols that
// swift-rs and Tauri's Swift glue (Channel.swift, OpenerPlugin.swift)
// emit at compile time but that Xcode 26's toolchain no longer ships.
// Swift 5.6 ABI features (concurrency, parameter packs) were promoted
// to the OS in iOS 17 — our deployment target — so these references
// are dead weight that can be resolved with empty no-op definitions.
//
// The `__asm__("name")` annotation overrides clang's symbol-mangling
// so the emitted Mach-O symbol matches exactly what the linker is
// looking for, including the leading underscore and the `$` separator.
//
// Without this stub the iOS app fails to link against Xcode 26 with:
//   ld: warning: search path '.../Metal.xctoolchain/usr/lib/swift-5.0/iphoneos' not found
//   Undefined symbols for architecture arm64:
//     "__swift_FORCE_LOAD_$_swiftCompatibility56", referenced from
//     __swift_FORCE_LOAD_$_swiftCompatibility56_$_SwiftRs in libapp.a(lib.swift.o)
//
// Tracked upstream in tauri-apps/tauri#14864.

void swift_force_load_compat_56(void) __asm__("__swift_FORCE_LOAD_$_swiftCompatibility56");
void swift_force_load_compat_56(void) {}

void swift_force_load_compat_concurrency(void) __asm__("__swift_FORCE_LOAD_$_swiftCompatibilityConcurrency");
void swift_force_load_compat_concurrency(void) {}

void swift_force_load_compat_packs(void) __asm__("__swift_FORCE_LOAD_$_swiftCompatibilityPacks");
void swift_force_load_compat_packs(void) {}
