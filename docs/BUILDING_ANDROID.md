# Building the Android application

The tested contributor workflow is Windows 11 with PowerShell or Command Prompt.

## Prerequisites

- Node.js 22 and npm 10 (the audited build used Node 22.16.0 / npm 10.9.2)
- JDK 21 (the audited build used OpenJDK 21)
- Android SDK with API 36 and compatible Android Build Tools
- Git

Set `ANDROID_HOME` or allow Android Studio to create the ignored `android/local.properties`. Never commit `local.properties`.

## Install exact JavaScript dependencies

From the repository root:

```powershell
npm.cmd ci
```

Use `npm ci` rather than `npm install` for the lockfile-reproducible dependency path.

## Browser development view

```powershell
npm.cmd run dev
```

This is a development convenience. Real UI and MIDI acceptance is performed in the Android application on hardware.

## Build and synchronize Android web assets

```powershell
npm.cmd run build:android:debug
npm.cmd run android:sync
```

Capacitor synchronization writes ignored generated web assets and plugin configuration into the Android project.

## Build a Debug APK

```powershell
npm.cmd run android:apk:debug
```

Expected output:

`android/app/build/outputs/apk/debug/app-debug.apk`

Verify public package/version metadata and the expected Android Debug signer:

```powershell
npm.cmd run android:verify:debug
```

Unix/macOS Gradle equivalents have not been validated by this project; do not treat the Windows commands above as a cross-platform build guarantee.

## Tests

Run the deterministic public Android suite:

```powershell
npm.cmd run test:public
```

After building the Debug APK, also run:

```powershell
npm.cmd run test:android-shell
```

The private development repository has additional legacy/Golden regression coverage that is intentionally not part of this Android-focused snapshot.

## Release signing

Official release signing is not public. Contributors do not need a permanent keystore, `keystore.properties`, passwords or the official signer to build Debug APKs.

Release Gradle tasks are fail-closed and require maintainer-controlled credentials and an absolute keystore path outside the repository. Do not request, copy, publish or commit the official key. See `android/RELEASE_SIGNING.md` for the security model; its commands do not provide the official secrets.
