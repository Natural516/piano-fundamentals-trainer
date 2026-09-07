# Android permanent release signing

## A4.0A boundary

This document defines the release-signing infrastructure only. A4.0A does not
generate a keystore, store a real password, build a signed release APK, or
replace the currently installed DEBUG app.

The permanent Android identity is frozen:

- Application ID: `com.pianofundamentals.trainer`
- Display name: `钢琴基本功训练器`

Every future in-place release update must use this same application ID and the
same permanent release key.

## Debug and release paths

`npm.cmd run android:apk:debug` continues to use the standard Android Debug
certificate.

`npm.cmd run android:apk:release` builds production web assets, synchronizes
Capacitor, and runs Gradle `assembleRelease`. The release task is fail-closed:
all four signing fields and an existing keystore outside the Git repository are
required. Missing or unsafe configuration causes an explicit Gradle failure;
release never falls back to debug signing and never emits an unsigned artifact
as if it were distributable.

Signing values are read from the local, gitignored
`android/keystore.properties`, with these optional environment-variable
overrides:

| Local property | Environment variable |
| --- | --- |
| `storeFile` | `PIANO_ANDROID_STORE_FILE` |
| `storePassword` | `PIANO_ANDROID_STORE_PASSWORD` |
| `keyAlias` | `PIANO_ANDROID_KEY_ALIAS` |
| `keyPassword` | `PIANO_ANDROID_KEY_PASSWORD` |

Neither Gradle nor the verification helper prints password values.

## Permanent key location

The intended private local location is:

`%USERPROFILE%\.android-signing\piano-fundamentals-release.jks`

The keystore must not be placed anywhere inside the Git repository. The Gradle
loader enforces an absolute path outside the repository. On Windows, use
forward slashes for `storeFile` in a Java Properties file, for example:

`C:/Users/YOUR_ACCOUNT/.android-signing/piano-fundamentals-release.jks`

The permanent alias is:

`piano-fundamentals`

## SIGN-001 permanent public identity

Status: **CLOSED / PERMANENT RELEASE IDENTITY APPROVED**

- Package: `com.pianofundamentals.trainer`
- Alias: `piano-fundamentals`
- Release certificate SHA-256: `19:3D:A3:16:AE:F6:A2:2F:9C:15:D1:01:9E:25:87:E7:25:85:8A:70:8B:D0:07:7A:D8:58:98:CD:65:57:96:32`

This fingerprint is the authoritative permanent Android signing identity. The
first Release APK passed real-device Human QA on the Lenovo Xiaoxin Pad Pro
12.7 with the Roland FP-30X, and the one-time DEBUG-to-RELEASE migration was
completed. The user confirmed an independent key backup. The key remains
external to the repository and its passwords remain private.

## User-run interactive key generation

Run the following commands locally only after Human Review. Do not paste the
passwords into chat, issue trackers, source files, shell history, or reports.
The command intentionally omits `-storepass` and `-keypass`, so `keytool`
prompts interactively.

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.android-signing"

& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore "$env:USERPROFILE\.android-signing\piano-fundamentals-release.jks" `
  -storetype JKS `
  -alias "piano-fundamentals" `
  -keyalg RSA `
  -keysize 4096 `
  -sigalg SHA256withRSA `
  -validity 36500
```

Use a unique strong password and store it in a password manager. The identity
questions describe the local certificate owner; they are not application data.

After the key exists, copy the committed template without changing the
template itself:

```powershell
Copy-Item android\keystore.properties.example android\keystore.properties
```

Edit only the gitignored `android/keystore.properties`. Set its absolute
`storeFile`, `storePassword`, `keyAlias`, and `keyPassword`. Never commit or
share that file.

## Android version contract

`android/version.properties` is the single Android package-version source.
The permanent Release chain began at A4.0B with `versionCode=1` and
`versionName=1.0`. The current A4.3C blocker-fix target values are:

- `versionCode=8`
- `versionName=1.3.4`

For every distributable update:

1. Increase `versionCode` monotonically. Android and the updater use it
   as the authoritative ordering value.
2. Set `versionName` to the human-readable release label.
3. Never reuse a lower or equal `versionCode` for a newer distributable APK.

The public production endpoint has one committed source in
`android/updater.properties`. Gradle embeds it in native `BuildConfig`, while
`vite.android-prototype.config.ts` embeds the same value for controller
configuration. Android production Manifest network retrieval is performed by
the native updater plugin and returns only bounded raw UTF-8 JSON to the
platform-neutral TypeScript parser. Release builds deliberately ignore the
development `UPDATE_MANIFEST_URL` override; non-Release builds may continue to
use that environment variable for isolated diagnostics.

## Build and verify

With the real local signing configuration in place:

```powershell
npm.cmd run android:apk:release
npm.cmd run android:verify:release
```

Expected release output:

`android/app/build/outputs/apk/release/app-release.apk`

The verifier uses Android SDK `aapt2` and `apksigner` to report only public APK
metadata:

- package ID
- DEBUG versus non-debuggable RELEASE status
- versionCode
- versionName
- signer certificate distinguished name
- signer certificate SHA-256 fingerprint

It also rejects a release APK that is debuggable, has the wrong package ID, is
unsigned, or uses the Android Debug certificate.

The current DEBUG artifact can be inspected separately:

```powershell
npm.cmd run android:apk:debug
npm.cmd run android:verify:debug
```

Record the permanent release certificate SHA-256 fingerprint after the first
real release key is generated and verified. The fingerprint is public metadata;
the private key and passwords are not.

## One-time DEBUG to RELEASE migration

The A3.1 app currently installed on DEVICE-001 is signed by the Android Debug
certificate. Android normally refuses to update that installation with an APK
using the same package ID but a different release certificate.

During A4.0B Human QA, uninstall the DEBUG app once, then install the first APK
signed by the permanent release key. This is intentionally scheduled before
real persistent practice data exists. After that migration, every distributable
APK must use the same permanent release key so Android can install it as an
in-place update.

## Backup checklist

Before Release V1 is treated as durable, confirm all of the following:

- Primary keystore exists only in the intended private local signing directory.
- One separate offline backup exists on independent media.
- Preferably, a second independent backup exists in another secure location.
- Keystore and key passwords are stored in a password manager or equivalent
  private system, not beside the repository.
- A restore check confirms the backup is readable and contains alias
  `piano-fundamentals` without exposing private material.
- The public SHA-256 certificate fingerprint is recorded for future package
  verification.

Losing the permanent key or its passwords prevents future APKs from upgrading
the installed application under the same signature. Backups are therefore a
release prerequisite, not an optional convenience.
