# Windows, macOS, iOS, and Android

CivicGuard shares its existing Web interface across four application targets:
Electron on Windows/macOS and Capacitor on iOS/Android. The generated app bundles
contain the interface and Leaflet assets, so opening the composer does not require
a Python server or an API key. Online maps and public ArcGIS data still require a
network connection. These packages remain alert **simulations**: they do not send
alerts, fetch verified emergency instructions, or turn the optional Flask AI API
into a deployed service. Drafts, language selection, and simulated channel choices
save on this device; approval resets on reload and requires fresh review.

## Download a build

Open the repository's **Actions → Platform builds**, select a successful run for
the desired commit, and download its artifacts. Pull requests run this workflow;
it can also be started with **Run workflow** after the workflow is on the default
branch. Artifacts expire after seven days. No GitHub release or app-store upload
is performed.

| Target | Actions artifact | File inside the artifact | What it can run |
| --- | --- | --- | --- |
| Windows | `civicguard-win-x64-unsigned` | `CivicGuard-0.2.0-win-x64.exe` | x64 Windows installer; unsigned |
| macOS Apple Silicon | `civicguard-mac-arm64-unsigned` | `CivicGuard-0.2.0-mac-arm64.dmg` and `.zip` | Apple Silicon Mac; not notarized |
| macOS Intel | `civicguard-mac-x64-unsigned` | `CivicGuard-0.2.0-mac-x64.dmg` and `.zip` | Intel Mac; not notarized |
| Android | `civicguard-android-debug` | `app-debug.apk` | Android 7/API 24 or newer; debug-signed testing build |
| iOS simulator | `civicguard-ios-simulator-arm64` | `CivicGuard-ios-simulator-arm64.zip` containing `App.app` | iOS Simulator on an Apple Silicon Mac |
| iOS device compilation | `civicguard-ios-device-unsigned-archive` | `CivicGuard-ios-device-unsigned.xcarchive.zip` | Build archive for inspection; **cannot install on an iPhone** |

Desktop filenames follow the version in `package.json`. macOS archives are zipped
before upload so the app's permissions and bundle layout survive artifact storage.
The iOS simulator application is also a nested zip for that reason. Extract the
outer Actions archive first, then the packaged application archive.

CI verifies compilation and launches each packaged desktop application on its
matching OS and architecture. Browser tests exercise the packaged mobile interface
in Chromium and WebKit. These checks do not establish complete device compatibility
or app-store acceptance. Unsigned desktop downloads may be
blocked by Windows or macOS. Public distribution requires the signing steps below;
do not disable OS security protections to distribute these development builds.

## Shared Web assets

Use Node.js 22.12 or newer, then run from the repository root:

```sh
npm ci
npm run build:web
```

The asset allowlist in the build script writes to `dist/web`. It excludes `.env`,
Python sources, databases, and repository metadata. Edit the original HTML/CSS/JS,
then rebuild; do not edit `dist/web` or the native projects' copied Web assets.

## Windows and macOS

Run on the matching operating system. macOS packaging needs a Mac. Development
and smoke testing use the same bundled assets as packaging:

```sh
npm run desktop:dev
npm run test:desktop
```

Create an installer on Windows:

```sh
npm run desktop:win -- --x64
```

Create disk images and application archives on macOS:

```sh
npm run desktop:mac -- --arm64
npm run desktop:mac -- --x64
```

Packages are written to `release/desktop/`. The workflow builds each architecture
on its matching runner and sets `CSC_IDENTITY_AUTO_DISCOVERY=false` for reproducible
development builds. The local packaging commands can use an installed signing
identity; no certificate or password belongs in the repository.

## Android

Install Android Studio 2025.2.1 or newer, JDK 21, Android SDK Platform 36, and SDK
Build-Tools 36.0.0. Android Studio's SDK Manager and Gradle JDK setting can provide
these. Set `ANDROID_HOME` to the installed SDK and `JAVA_HOME` to JDK 21 for command
line builds. The committed wrapper selects the project's Gradle version; a global
Gradle installation is unnecessary. The compile and target SDK is 36, and the
minimum device API is 24. See the [Capacitor 8 requirements](https://capacitorjs.com/docs/updating/8-0)
and the [pinned Capacitor Android build configuration](https://github.com/ionic-team/capacitor/blob/8.5.3/android/capacitor/build.gradle).

```sh
npm run build:web
npx cap sync android
npx cap open android
```

Build from Android Studio, or use the terminal:

```sh
cd android
./gradlew --no-daemon assembleDebug
```

On Windows, use `gradlew.bat --no-daemon assembleDebug`. The output is
`android/app/build/outputs/apk/debug/app-debug.apk` relative to the repository root.
To install on a connected development device or emulator with `adb` available,
run from the repository root:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

CI creates a fresh debug signing key on each runner. If Android reports an update
signature mismatch between two CI builds, uninstall the previous debug app before
installing the new one; uninstalling clears that app's local data. Use a stable,
privately managed signing key for a persistent test channel or a release.

## iOS

Install full Xcode 26 or newer on a Mac and select it as the active developer
directory. Command Line Tools alone do not contain the iOS SDK. The deployment
target is iOS 15.0. This project uses Swift Package Manager, so CocoaPods is not
required. The [Capacitor environment guide](https://capacitorjs.com/docs/getting-started/environment-setup)
describes the native prerequisites.

```sh
npm run build:web
npx cap sync ios
npx cap open ios
```

In Xcode, select the **App** scheme and an iOS simulator, then Run. To reproduce the
Apple Silicon simulator build from the repository root:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath dist/ios-simulator \
  ARCHS=arm64 CODE_SIGNING_ALLOWED=NO build
```

The app is `dist/ios-simulator/Build/Products/Release-iphonesimulator/App.app`.
After booting a compatible simulator in Xcode, install and launch it with:

```sh
xcrun simctl install booted dist/ios-simulator/Build/Products/Release-iphonesimulator/App.app
xcrun simctl launch booted io.github.ii300.civicguard
```

An Intel Mac needs its own simulator build with `ARCHS=x86_64`; the downloaded
arm64 simulator artifact does not run on an Intel simulator. Device and simulator
binaries are different even when both use arm64.

The workflow explicitly selects Xcode 26.2 on `macos-15`, which is listed in
[GitHub's Apple Silicon runner inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-arm64-Readme.md).
It also compiles an unsigned device archive at
`dist/ios-device/CivicGuard.xcarchive` using the `iphoneos` SDK. That archive proves
device compilation only; it is not an IPA, provisioned device build, or TestFlight
submission.

## Verification

Run the packaged interface tests with Playwright's mobile browser profiles:

```sh
npx playwright install chromium webkit
npm run test:packaged
```

The suite builds `dist/web`, serves it locally, and blocks external requests. It
checks local scripts/styles, the offline sample map, touch navigation, simulated
safe-area insets, editing across languages, approval, horizontal overflow, and CSP
or JavaScript errors in Pixel 7/Chromium and iPhone 13/WebKit profiles. The **Tests**
workflow runs this suite. These browser profiles do not execute the Capacitor
native bridge; real device testing is still required for native system bars,
keyboards, rotation, lifecycle events, and external browser handoffs.

Desktop smoke tests can launch either the development shell (`npm run test:desktop`)
or the app produced by electron-builder. After packaging on an Apple Silicon Mac:

```sh
CIVICGUARD_EXECUTABLE_PATH="$PWD/release/desktop/mac-arm64/CivicGuard.app/Contents/MacOS/CivicGuard" \
  node desktop/smoke.cjs
```

For an Intel Mac, replace `mac-arm64` with `mac`. After packaging on Windows, use
PowerShell from the repository root:

```powershell
$env:CIVICGUARD_EXECUTABLE_PATH = (Resolve-Path 'release/desktop/win-unpacked/CivicGuard.exe').Path
node desktop/smoke.cjs
```

The **Platform builds** workflow executes this check after packaging on every
desktop runner, before uploading installers. It verifies that the supplied app
is packaged and reads from `app.asar`, then exercises the offline map/composer,
draft preservation, simulated approval, sandbox/isolation settings, denied
permissions, restricted resources, and blocked external navigation. It saves
`output/desktop-packaged-smoke.png` locally. This starts the unpacked application
produced alongside the installer; it does not automate the NSIS installer or the
DMG drag-to-Applications flow.

## Signing and distribution

- **Windows:** configure a trusted code-signing certificate or supported signing
  service for electron-builder before publishing installers. CI deliberately
  contains no signing credentials.
- **macOS:** use an Apple Developer ID Application identity and notarization for
  distribution outside the Mac App Store. Configure credentials in a protected
  release environment, then verify signing and notarization on the final package.
  See [Electron's signing guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing).
- **Android:** create and securely back up a release keystore, configure release
  signing, and build a signed APK or Play App Bundle. Never ship the CI debug key
  as a release identity. Follow [Android app signing](https://developer.android.com/studio/publish/app-signing).
- **iOS:** select your Apple development team in Xcode, configure a unique App ID
  and provisioning, and build a signed device app. TestFlight/App Store distribution
  needs Apple Developer Program enrollment and App Store Connect setup. Archive
  and export through Xcode's distribution workflow with the appropriate signing
  credentials. Follow [Capacitor's App Store guide](https://capacitorjs.com/docs/ios/deploying-to-app-store).

Before store submission, replace provisional branding as needed, validate the
bundle ID `io.github.ii300.civicguard` under the actual publisher's account, complete
privacy/store metadata, and exercise the app on real devices. No location, push
notifications, background alert delivery, automatic updates, or production AI
service is introduced by these wrappers. Those features need separate design,
permissions, and verification.
