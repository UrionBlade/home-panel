#!/usr/bin/env bash
# Local iOS release to TestFlight.
#
# Why this exists: GitHub macos-15 (Intel) and macos-latest (Apple Silicon)
# runners produce .app bundles whose Mach-O isn't recognised as "app bundle"
# by codesign (Format=bundle), making any re-sign degrade the bundle id to
# CFBundleName and Apple's server-side validator reject the upload with
# 409 'not signed using submission certificate'. Running the same recipe on
# the Mac locally produces Format=app bundle and upload succeeds.
#
# Verified working deliveries on 2026-04-30:
#   0b916af3-bc92-45e8-b6ac-ccaa390bb9f4 (v0.27.9 baseline)
#   774cad10-a4da-4866-835a-76f98b1d7da7 (main code)
#   3f833668-2b1b-418d-8bf0-b3672e05e0d4 (main code, build 401)
#
# Prereqs on the Mac:
#   - Xcode 26.2+ installed at /Applications/Xcode.app
#   - Apple Distribution cert (D21F2F…) + private key in login.keychain
#   - Provisioning profile "Home Panel App store" installed in
#     ~/Library/MobileDevice/Provisioning Profiles/
#   - ASC API key at ~/Desktop/AuthKey_KD3K3LBKTC.p8 (or env override)
#   - Tauri CLI + pnpm installed

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/apps/mobile"
TAURI_CONF="$APP_DIR/src-tauri/tauri.conf.json"
TEAM_ID="JB3JURZ8UG"
BUNDLE_ID="com.matteopoli.homepanel"

# ---- Bump tauri.conf.json version ----
# Usage: ./scripts/release-ios.sh [fix|feat|major]
# - fix   → patch++ (0.27.45 → 0.27.46)   [default]
# - feat  → minor++ (0.27.45 → 0.28.0)
# - major → major++ (0.27.45 → 1.0.0)
BUMP_TYPE="${1:-fix}"
case "$BUMP_TYPE" in
  fix|patch)   BUMP_KIND="patch" ;;
  feat|minor)  BUMP_KIND="minor" ;;
  major)       BUMP_KIND="major" ;;
  *)
    echo "❌ Unknown bump type '$BUMP_TYPE' — use fix | feat | major" >&2
    exit 1
    ;;
esac

CURRENT_VERSION=$(/usr/bin/python3 -c "import json; print(json.load(open('$TAURI_CONF'))['version'])")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
case "$BUMP_KIND" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
esac
NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
echo "→ Version bump ($BUMP_KIND): $CURRENT_VERSION → $NEW_VERSION"
/usr/bin/python3 - <<PY
import json, pathlib
p = pathlib.Path("$TAURI_CONF")
data = json.loads(p.read_text())
data["version"] = "$NEW_VERSION"
p.write_text(json.dumps(data, indent=2) + "\n")
PY
git -C "$ROOT" add "$TAURI_CONF"
git -C "$ROOT" commit -m "chore(release): v$NEW_VERSION ($BUMP_KIND)" >/dev/null
echo "→ Committed chore(release): v$NEW_VERSION ($BUMP_KIND)"
APPLE_ID_NUMERIC="6762917341"
ASC_KEY_ID="${ASC_KEY_ID:-KD3K3LBKTC}"
ASC_ISSUER_ID="${ASC_ISSUER_ID:-ad154f37-dc13-4bf9-895a-a7c71b60b45b}"
ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/Desktop/AuthKey_${ASC_KEY_ID}.p8}"
PROFILE_NAME="Home Panel App store"
PROFILE_UUID="${PROFILE_UUID:-8202a7be-295a-4ff3-83c8-add27446e1d0}"

# Resolve cert SHA from the keychain (most recently issued matching).
CERT_SHA=$(security find-identity -v -p codesigning login.keychain \
  | awk '/Apple Distribution: Matteo Poli/ {print $2}' | tail -1)
if [ -z "$CERT_SHA" ]; then
  echo "❌ No Apple Distribution cert in login.keychain" >&2
  exit 1
fi
echo "→ Cert SHA: $CERT_SHA"
echo "→ Profile UUID: $PROFILE_UUID"
echo "→ Apple ID: $APPLE_ID_NUMERIC"

# Build number: GitHub run number if available, else unix timestamp.
BUILD_NUM="${GITHUB_RUN_NUMBER:-$(date +%s)}"
echo "→ Build number: $BUILD_NUM"

cd "$APP_DIR"

# Fresh tauri ios project + dependencies.
echo "→ Cleaning gen/apple + DerivedData…"
rm -rf src-tauri/gen/apple
rm -rf "$HOME/Library/Developer/Xcode/DerivedData/mobile-"*

echo "→ pnpm tauri ios init…"
pnpm tauri ios init >/dev/null 2>&1

# Generate iOS app icons AFTER tauri ios init — init regenerates
# gen/apple/Assets.xcassets with the default Tauri 'T' placeholder,
# so `tauri icon` must overwrite that AFTER init has run.
echo "→ pnpm tauri icon…"
pnpm tauri icon src-tauri/icons/icon.png 2>&1 | tail -5 \
  || echo "(tauri icon failed — bundle may carry placeholder icon)"

# Patch pbxproj for manual signing with our cert + profile, and remove
# the duplicate libapp.a Resources entry that tauri's generator creates
# (`Multiple commands produce libapp.a` build error).
echo "→ Patching pbxproj…"
PBXPROJ="src-tauri/gen/apple/mobile.xcodeproj/project.pbxproj"
plutil -convert xml1 -o /tmp/proj.xml "$PBXPROJ"
/usr/bin/python3 - <<PY
import plistlib
with open('/tmp/proj.xml', 'rb') as f:
    p = plistlib.load(f)
target_uuid = next(u for u, o in p['objects'].items()
                   if o.get('isa') == 'PBXNativeTarget' and o.get('name') == 'mobile_iOS')
project = p['objects'][p['rootObject']]
attrs = project.setdefault('attributes', {})
ta = attrs.setdefault('TargetAttributes', {})
ta.setdefault(target_uuid, {})
ta[target_uuid]['ProvisioningStyle'] = 'Manual'
ta[target_uuid]['DevelopmentTeam'] = '$TEAM_ID'

# Remove debug libapp.a from Resources phase.
fileref_libapp = [u for u, o in p['objects'].items()
                  if o.get('isa') == 'PBXFileReference' and o.get('path', '').endswith('libapp.a')]
debug_libapp = [c for u, o in p['objects'].items() if o.get('isa') == 'PBXGroup' and o.get('path') == 'debug'
                for c in o.get('children', []) if c in fileref_libapp]
debug_bf = [u for u, o in p['objects'].items()
            if o.get('isa') == 'PBXBuildFile' and o.get('fileRef') in debug_libapp]
for u, o in p['objects'].items():
    if o.get('isa') == 'PBXResourcesBuildPhase':
        for bf in debug_bf:
            if bf in o.get('files', []):
                o['files'].remove(bf)

for u, o in p['objects'].items():
    if o.get('isa') == 'XCBuildConfiguration':
        bs = o.setdefault('buildSettings', {})
        bs['CODE_SIGN_STYLE'] = 'Manual'
        bs['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
        bs['CODE_SIGN_IDENTITY[sdk=iphoneos*]'] = 'Apple Distribution'
        bs['DEVELOPMENT_TEAM'] = '$TEAM_ID'
        bs['PROVISIONING_PROFILE_SPECIFIER'] = '$PROFILE_NAME'
        bs['PROVISIONING_PROFILE'] = '$PROFILE_UUID'
        bs['PRODUCT_BUNDLE_IDENTIFIER'] = '$BUNDLE_ID'

with open('/tmp/proj.xml', 'wb') as f:
    plistlib.dump(p, f)
PY
plutil -convert xml1 /tmp/proj.xml -o "$PBXPROJ"

# Vite-injected env (build-time). Default to the NAS LAN IP that
# `pnpm dev:nas` uses; override via VITE_API_BASE_URL / VITE_API_TOKEN
# from the calling shell.
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://192.168.178.36:3000}"
if [ -z "${VITE_API_TOKEN:-}" ] && [ -f "$APP_DIR/.env" ]; then
  VITE_API_TOKEN=$(grep -E '^VITE_API_TOKEN=' "$APP_DIR/.env" | cut -d= -f2-)
fi
export VITE_API_TOKEN
echo "→ VITE_API_BASE_URL=$VITE_API_BASE_URL"
echo "→ VITE_API_TOKEN set: $([ -n "$VITE_API_TOKEN" ] && echo yes || echo NO)"

# Tauri ios build (build phase succeeds, archive fails on Xcode 26 —
# we salvage the .app from DerivedData and assemble the IPA manually).
echo "→ pnpm tauri ios build…"
pnpm tauri ios build --export-method app-store-connect --build-number "$BUILD_NUM" \
  || echo "(archive step expected to fail on Xcode 26 — salvaging .app)"

BUILT_APP=$(find "$HOME/Library/Developer/Xcode/DerivedData/mobile-"* \
  -path "*/Build/Products/release-iphoneos/Home Panel.app" -maxdepth 6 -print -quit)
if [ -z "$BUILT_APP" ] || [ ! -d "$BUILT_APP" ]; then
  echo "❌ No built .app under DerivedData" >&2
  exit 1
fi
echo "→ Built .app: $BUILT_APP"

# Stamp CFBundleVersion = CFBundleShortVersionString. Apple resets the
# build-number counter whenever the marketing version (semver) bumps,
# so we don't need a sub-version suffix as long as we bump
# tauri.conf.json before each release. If you re-upload the same
# semver, bump tauri.conf.json first.
SHORT_VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$BUILT_APP/Info.plist")
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $SHORT_VERSION" "$BUILT_APP/Info.plist"
echo "→ CFBundleVersion = $SHORT_VERSION"

# Inject usage strings (Apple rejects build without these).
/usr/libexec/PlistBuddy -c "Add :NSMicrophoneUsageDescription string 'Home Panel uses the microphone for voice commands.'" "$BUILT_APP/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Set :NSMicrophoneUsageDescription 'Home Panel uses the microphone for voice commands.'" "$BUILT_APP/Info.plist"
/usr/libexec/PlistBuddy -c "Add :NSSpeechRecognitionUsageDescription string 'Home Panel processes voice locally.'" "$BUILT_APP/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Set :NSSpeechRecognitionUsageDescription 'Home Panel processes voice locally.'" "$BUILT_APP/Info.plist"

# Drop libapp.a if it leaked into the bundle root (codesign treats it
# as orphan code and breaks app-bundle recognition).
rm -f "$BUILT_APP/libapp.a"

# Build the entitlements plist from the installed provisioning profile —
# Xcode build phase emits a minimal subset that Apple rejects with
# "Missing Code Signing Entitlements".
PROFILE_PATH="$HOME/Library/MobileDevice/Provisioning Profiles/${PROFILE_UUID}.mobileprovision"
ENT_PATH="/tmp/home-panel.full-entitlements.plist"
security cms -D -i "$PROFILE_PATH" > /tmp/profile-decoded.plist
/usr/libexec/PlistBuddy -x -c 'Print :Entitlements' /tmp/profile-decoded.plist > "$ENT_PATH"

# Re-sign: --force --deep --entitlements WITHOUT --preserve-metadata.
# --preserve-metadata=runtime,flags makes codesign degrade the bundle
# from "app bundle" to "bundle" (Info.plist=not bound), which Apple
# rejects with the misleading 'submission certificate' 409.
echo "→ codesign --force --deep…"
codesign --force --deep \
  --sign "$CERT_SHA" \
  --entitlements "$ENT_PATH" \
  "$BUILT_APP"

echo "→ codesign verify:"
codesign -dvv "$BUILT_APP" 2>&1 | head -12

# Package IPA.
echo "→ Assembling IPA…"
PAYLOAD=/tmp/Payload
IPA_DIR=/tmp/local-ipa
rm -rf "$PAYLOAD" "$IPA_DIR"
mkdir -p "$PAYLOAD" "$IPA_DIR"
ditto "$BUILT_APP" "$PAYLOAD/Home Panel.app"
(cd /tmp && zip -qry "$IPA_DIR/Home Panel.ipa" Payload)
echo "→ IPA: $IPA_DIR/Home Panel.ipa ($(du -h "$IPA_DIR/Home Panel.ipa" | cut -f1))"

# Upload via altool.
mkdir -p "$HOME/.appstoreconnect/private_keys"
cp "$ASC_KEY_PATH" "$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
echo "→ Uploading to TestFlight…"
xcrun altool --upload-app --type ios \
  --apple-id "$APPLE_ID_NUMERIC" \
  --file "$IPA_DIR/Home Panel.ipa" \
  --apiKey "$ASC_KEY_ID" \
  --apiIssuer "$ASC_ISSUER_ID" \
  --output-format json

echo ""
echo "✅ Upload complete. Check https://appstoreconnect.apple.com/apps/${APPLE_ID_NUMERIC}/testflight/ios"
