# Android A4.3A In-App Updater Product and Security Contract

Status: **READY FOR HUMAN REVIEW / SPECIFICATION ONLY**

This document freezes the Android V1 updater contract before implementation.
A4.3A contains no updater runtime, networking, APK download, archive inspection,
installer launch, UI change, or Android package-version change.

## 1. Scope and immutable release identity

The Android V1 updater is user-initiated and applies only to the trainer's own
Release APK. It is not a general package manager.

The trusted installed identity is immutable:

| Property | Frozen value |
| --- | --- |
| Package ID | `com.pianofundamentals.trainer` |
| Current approved versionCode | `3` |
| Current approved versionName | `1.2.0` |
| Permanent signer certificate SHA-256 | `19:3D:A3:16:AE:F6:A2:2F:9C:15:D1:01:9E:25:87:E7:25:85:8A:70:8B:D0:07:7A:D8:58:98:CD:65:57:96:32` |

Every updater-delivered APK must have the exact package ID and permanent signer
above, and its `versionCode` must be greater than the currently installed
`versionCode`. Android Debug signing is never accepted.

This contract does not allow signer rotation, an alternate package, or a
downgrade. A future need to change any of those is a new security design and
cannot be introduced by changing a manifest.

## 2. Product contract

The approved flow is:

```text
Settings / Update
  -> user taps Check for updates
  -> fetch and validate manifest
  -> compare versionCode
  -> present release information
  -> user chooses Download
  -> download to app-controlled cache
  -> verify every required property
  -> user chooses Install
  -> Android system installer confirmation
  -> Android performs or rejects the in-place update
  -> next app launch reads installed package metadata
```

The following are prohibited:

- background or forced updates;
- silent or automatic installation;
- mandatory-update lockout;
- root, ADB, shell, accessibility automation, or installer automation;
- claiming installation succeeded because an installer intent was launched;
- clearing application data;
- embedding secrets, tokens, cookies, or authenticated download credentials;
- using an updater artifact as a reason to block launch or practice.

The updater may navigate the user to Android's per-app "Install unknown apps"
settings when required, but the user must return and explicitly choose Install.

## 3. Vendor-neutral update source

The manifest endpoint is a build-time value named `UPDATE_MANIFEST_URL`.

Requirements:

- it is one absolute public HTTPS URL;
- it contains no credential material;
- the updater is not coupled to GitHub, Cloudflare, or another hosting API;
- the manifest may reference an independently hosted public HTTPS APK;
- redirects, if supported by the future transport, must end at HTTPS and must
  never downgrade to another URI scheme;
- normal requests send no ambient cookies or authentication credentials.

Missing or invalid build-time configuration fails closed as an updater-only
configuration error. It does not affect the rest of the application.

## 4. Manifest schemaVersion 1

The wire representation is UTF-8 JSON. The top-level value must be one object.
Unknown top-level fields and duplicate field names are rejected so that the
same bytes cannot have ambiguous interpretations across implementations.

Exact example:

```json
{
  "schemaVersion": 1,
  "packageId": "com.pianofundamentals.trainer",
  "versionCode": 4,
  "versionName": "1.3.0",
  "apkUrl": "https://updates.example.invalid/piano-fundamentals-1.3.0.apk",
  "apkSha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "apkSizeBytes": 3908474,
  "publishedAt": "2026-09-02T00:00:00Z",
  "releaseNotes": [
    "Example release note rendered as plain text."
  ]
}
```

Exact logical schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "packageId",
    "versionCode",
    "versionName",
    "apkUrl",
    "apkSha256",
    "apkSizeBytes",
    "publishedAt",
    "releaseNotes"
  ],
  "properties": {
    "schemaVersion": { "type": "integer", "const": 1 },
    "packageId": { "type": "string", "const": "com.pianofundamentals.trainer" },
    "versionCode": { "type": "integer", "minimum": 1, "maximum": 2100000000 },
    "versionName": { "type": "string", "minLength": 1, "maxLength": 64 },
    "apkUrl": { "type": "string", "format": "uri", "maxLength": 2048 },
    "apkSha256": { "type": "string", "pattern": "^[A-Fa-f0-9]{64}$" },
    "apkSizeBytes": { "type": "integer", "minimum": 1, "maximum": 268435456 },
    "publishedAt": { "type": "string", "format": "date-time" },
    "releaseNotes": {
      "type": "array",
      "maxItems": 50,
      "items": { "type": "string", "minLength": 1, "maxLength": 2000 }
    }
  }
}
```

Semantic validation is additional to structural validation:

- `versionName` and every release note must remain non-empty after trimming;
- `apkUrl` must parse as an absolute URL with scheme exactly `https:`, a
  non-empty host, no username/password, and no fragment;
- `apkSha256` comparison is case-insensitive after normalization to uppercase;
- `publishedAt` must parse as a finite RFC 3339 / ISO-8601 instant;
- release notes are rendered as plain text, never HTML or Markdown with active
  links/scripts;
- the manifest response is limited to 65,536 bytes before parsing;
- values outside safe integer range, `NaN`, coercible strings, and guessed
  defaults are rejected.

There is no mandatory-update flag, command, script, installer argument, or
arbitrary extension field in schemaVersion 1.

## 5. Installed-version decision

Installed package metadata, obtained from Android package metadata through the
existing Capacitor App boundary or a minimal native adapter, is authoritative.
`versionName` is display-only and is never used for ordering.

| Decision | Result |
| --- | --- |
| `manifest.versionCode > installed.versionCode` | `updateAvailable` |
| `manifest.versionCode == installed.versionCode` | `upToDate` with `NO_UPDATE` |
| `manifest.versionCode < installed.versionCode` | no downgrade; `upToDate` with `MANIFEST_OLDER_THAN_INSTALLED` |
| installed or manifest versionCode invalid | fail closed |

A newer `publishedAt` or lexically greater `versionName` cannot override these
rules.

## 6. Required verification chain

Every stage below is mandatory and ordered:

```text
HTTPS manifest
  -> bounded response and strict schema/semantic validation
  -> installed versionCode comparison
  -> HTTPS APK download to app-controlled temporary cache
  -> completed byte-count equals manifest.apkSizeBytes
  -> local APK SHA-256 equals manifest.apkSha256
  -> archive parses as an Android APK
  -> archive packageName equals com.pianofundamentals.trainer
  -> archive versionCode equals manifest.versionCode
  -> archive versionCode is greater than installed versionCode
  -> archive current signer set exactly matches the pinned permanent signer
  -> verified-artifact authorization is created
  -> and only then may the user launch the Android system installer
```

No stage is advisory. A later stage cannot repair or override an earlier
failure. A failed or cancelled download is never installable.

The signer pin is application-owned trusted configuration, not a value supplied
by the manifest. The native verifier hashes the DER bytes of the APK's current
signing certificate with SHA-256. The accepted current signer set is exactly:

```text
{ 19:3D:A3:16:AE:F6:A2:2F:9C:15:D1:01:9E:25:87:E7:25:85:8A:70:8B:D0:07:7A:D8:58:98:CD:65:57:96:32 }
```

An APK with an additional, replacement, historical-lineage-only, or Debug
signer fails this Android V1 contract.

### Archive signer inspection by Android API level

The application baseline remains `minSdkVersion=24`. The updater must inspect
the downloaded archive's **current** signer on every supported API without
calling an API that does not exist on that device:

- API 28 and newer: call `PackageManager.getPackageArchiveInfo()` with
  `GET_SIGNING_CERTIFICATES`, require non-null `PackageInfo.signingInfo`, and
  read `SigningInfo.getApkContentsSigners()`. `getSigningCertificateHistory()`
  is not an alternative trust set because this contract accepts only the APK's
  current signer.
- API 24-27: call the API-compatible archive path with `GET_SIGNATURES` and
  read `PackageInfo.signatures`. The implementation must not reference or call
  `SigningInfo` on this branch.

Both branches normalize every returned current `Signature` certificate byte
sequence to an uppercase colon-separated SHA-256 fingerprint. Empty, null,
unparseable, or ambiguous signer metadata fails closed. The normalized set must
be exactly equal to the one-element pinned set above: no Debug signer, no
additional current signer, and no manifest-controlled signer.

API-specific retrieval changes only how the current signer bytes are obtained;
it does not weaken the equality rule. If a supported device cannot reliably
inspect current signer metadata with its public API path, installation is not
enabled and the updater returns a sanitized signer-inspection error.

## 7. Download, verified artifact, and token lifecycle

- APK bytes are streamed into the application's private cache, initially using
  a native-controlled, non-installable `.part` artifact.
- No noteOn/practice data path is involved.
- The download reports byte progress and may support explicit cancellation.
- The stream enforces the application-owned 268,435,456-byte (256 MiB) maximum
  artifact size in addition to the manifest byte count. A manifest cannot
  increase this limit.
- File size and SHA-256 are computed from local completed bytes; no remote
  digest header is trusted.
- Only a completed and closed `.part` artifact can enter `verifying`.
- After the complete size/hash/archive/package/version/signer chain passes, the
  native layer atomically promotes that file into a narrow private
  `VERIFIED`-artifact scope and issues an opaque verified token.
- A promoted `VERIFIED` artifact must never be opened for further writing. The
  native updater and its FileProvider expose it as read-only, and JavaScript is
  never given a filesystem path or URI that grants mutation authority.
- Failed, cancelled, mismatched, superseded, or stale artifacts are deleted.
- A process death never restores a UI claim of `verified`. On restart, `.part`
  files are removed. Any retained completed artifact must pass the entire
  byte/hash/archive/package/version/signer chain again before installation.
- JavaScript receives only an opaque process-local token. It never receives
  authority to install an arbitrary filesystem path, URI, URL, or manifest.

Each native token-registry entry binds exactly one artifact to sufficient
verification identity:

- canonical native-controlled artifact identity and narrow verified-cache
  location;
- expected and observed byte size;
- verified local SHA-256;
- exact package ID;
- exact archive and manifest versionCode;
- exact normalized current signer set;
- verification generation/update selection and a live `VERIFIED` state.

The token is unforgeable from JavaScript and is valid only in the native process
that issued it. Process death, cancellation, any verification failure, artifact
cleanup, selection of a newer/different manifest, supersession, or any detected
artifact change invalidates the token. A completed APK may survive in private
cache after process death, but the entire mandatory chain must run again before
a new token is issued.

The installer boundary is exactly:

```text
installVerifiedArtifact(token)
```

It must not accept an arbitrary path, URI, URL, or manifest object as
installation authority. Immediately before FileProvider/system-installer
launch, the native plugin must confirm that:

- the token still exists in the process-local registry and is live;
- it still binds the selected update and exactly one `VERIFIED` artifact;
- the canonical referenced artifact is still inside the narrow verified scope;
- the same artifact still exists, remains read-only, and has not been replaced,
  superseded, cleaned, or reopened for writing;
- its bound size/hash/package/version/signer verification identity is still the
  identity authorized by the token.

If any invariant is false or cannot be proven, the plugin invalidates the token,
does not create installer authority, and returns to `verifying` or a sanitized
error. The full mandatory verification chain is required before another token
can be issued. Stale verification authorization is never used for installation.

## 8. State model

The platform-neutral state machine owns the following states:

| State | Meaning | Allowed user action |
| --- | --- | --- |
| `idle` | no check is running | Check for updates |
| `checking` | manifest fetch/validation/version decision in progress | none; optional cancel only if transport supports it |
| `upToDate` | equal or older manifest; no install offer | Check again |
| `updateAvailable` | valid newer manifest, not downloaded | Download |
| `downloading` | private-cache transfer with byte progress | Cancel if implemented |
| `verifying` | byte/hash/archive/package/version/signer chain running | none |
| `readyToInstall` | all checks passed and verified authorization is live | Install |
| `installPermissionRequired` | Android disallows this app as an install source | Open system settings, then return |
| `installerLaunched` | system installer intent was launched; result not claimed | wait for user/system; next launch rechecks installed metadata |
| `error` | sanitized category plus a permitted retry target | Retry only the safe stage described by the error |

`installPermissionRequired` is a reliable preflight state on API 26+ only. On
API 24-25 there is no equivalent public per-source capability query; a blocked
normal installer flow maps to sanitized permission/launch guidance in `error`
without pretending the app knew the legacy global setting in advance.

Required transitions:

```text
idle -> checking                                      user check
checking -> upToDate | updateAvailable | error       check result
upToDate -> checking                                  user checks again
updateAvailable -> downloading                       user download
downloading -> updateAvailable                        user cancel + cleanup
downloading -> verifying | error                     complete or fail
verifying -> readyToInstall | error                  all checks or hard fail
readyToInstall -> installPermissionRequired           API 26+ capability false
readyToInstall -> installerLaunched | error           user install
installPermissionRequired -> readyToInstall           permission confirmed and artifact re-authorized
installerLaunched -> idle/checking                     later app launch reads installed package info
error -> checking | updateAvailable | downloading     explicit safe retry only
```

There is deliberately no `installedSuccessfully` transition from
`installerLaunched`. On the next launch, installed `versionCode/versionName`
must be read from Android. If the installed `versionCode` matches or exceeds the
previously offered version, the update is considered complete. Training data is
never cleared.

## 9. Sanitized outcome and error categories

Normal UI receives only a category and concise localized copy. Raw exceptions,
URLs containing sensitive query data, filesystem paths, certificate bytes, and
stack traces are DEBUG-only diagnostics.

| Category | Meaning / containment |
| --- | --- |
| `MANIFEST_NETWORK_ERROR` | fetch failed/timed out; updater only; retry check |
| `MANIFEST_INVALID` | JSON/schema/semantic failure; no offer |
| `MANIFEST_UNSUPPORTED_SCHEMA` | schemaVersion is not 1; no guessing |
| `PACKAGE_ID_MISMATCH` | manifest package differs; hard fail |
| `NO_UPDATE` | equal version; neutral up-to-date result |
| `MANIFEST_OLDER_THAN_INSTALLED` | replay/older manifest; no downgrade offer |
| `DOWNLOAD_NETWORK_ERROR` | transfer failed; delete partial; retry download |
| `DOWNLOAD_SIZE_MISMATCH` | completed bytes differ; delete artifact; fresh retry |
| `APK_SHA256_MISMATCH` | digest differs; hard fail and delete/quarantine |
| `APK_PACKAGE_MISMATCH` | archive package differs; hard fail |
| `APK_VERSION_MISMATCH` | archive and manifest version differ; hard fail |
| `APK_DOWNGRADE_REJECTED` | archive version is not greater than installed; hard fail |
| `APK_SIGNER_MISMATCH` | current signer set differs from pinned signer; hard fail, no bypass |
| `APK_SIGNER_INSPECTION_UNAVAILABLE` | supported public archive API cannot establish a current signer set; fail closed |
| `APK_ARCHIVE_INVALID` | PackageManager cannot parse archive; hard fail |
| `INSTALL_PERMISSION_REQUIRED` | show guidance and system-settings action only |
| `INSTALL_PLATFORM_UNSUPPORTED` | supported public install flow is unavailable on this API/device; updater only |
| `INSTALL_LAUNCH_FAILED` | installer intent could not launch; retain only revalidated artifact |
| `UPDATER_CONFIGURATION_ERROR` | build-time manifest URL absent/invalid; updater unavailable |
| `INSTALLED_PACKAGE_INFO_ERROR` | installed identity/version unavailable; fail closed |

Cancellation is a user transition, not a security error.

## 10. Pure logic and ports

The updater core remains outside React and outside `src/sightReading`. It owns:

- manifest parsing result validation;
- version decision;
- the state machine and legal transitions;
- sanitized error mapping;
- orchestration of ports without direct DOM, Capacitor, or Kotlin imports.

Conceptual platform ports:

```text
InstalledPackageInfoPort
ManifestFetchPort
ApkArtifactPort
ApkVerificationPort
InstallerPort
UpdaterClockPort (only where deterministic timeout/timestamp behavior is needed)
```

React renders state and sends explicit user intents. It does not decide whether
an APK is trusted and cannot create a `readyToInstall` state directly.

## 11. Recommended web/native ownership

Recommended boundary for the later implementation:

### TypeScript / Capacitor side

- fetch the small public manifest with timeout, response-size limit, no
  credentials, and final HTTPS URL validation;
- strict manifest validation and version decision in the pure core;
- state-machine orchestration and sanitized UI copy;
- read installed display version through Capacitor App info, with a native
  package-info fallback if required by real-device evidence.

### Minimal Android native plugin

A dedicated updater plugin should own operations that require Android package
or filesystem authority:

- stream the public HTTPS APK into private cache without copying a complete APK
  through the JavaScript bridge;
- emit bounded progress and support cancellation/cleanup;
- compute completed byte count and SHA-256 while/after streaming;
- parse archive package name/version with PackageManager archive APIs;
- extract current APK signing metadata through the API 28+
  `GET_SIGNING_CERTIFICATES`/`SigningInfo` path or the API 24-27
  `GET_SIGNATURES`/`PackageInfo.signatures` path, then enforce the same
  application-owned signer pin;
- atomically promote a fully verified closed `.part` file into the native-only
  read-only verified scope;
- create a process-local opaque verified-artifact token bound to artifact
  identity, size, hash, package, version, signer result, and update generation;
- invalidate the token on mismatch, cancellation, supersession, cleanup,
  process restart, or artifact change;
- use API-gated install-capability handling and never invoke
  `canRequestPackageInstalls()` below API 26;
- on API 26+, open Android's per-app unknown-source settings using the real
  package URI when the user explicitly requests it;
- launch the normal system installer with a FileProvider `content://` URI and
  temporary read permission;
- delete partial, failed, obsolete, and consumed cache artifacts.

The installer method is `installVerifiedArtifact(token)` and accepts only an
opaque artifact previously authorized by the native verification chain. It does
not accept an arbitrary path, URI, URL, or manifest. The native plugin validates
the live token/artifact invariants immediately before launch, so a UI/state bug
or stale authorization cannot bypass verification.

This split keeps product/version/state policy deterministic in TypeScript while
avoiding a large APK in JavaScript memory, a full-file bridge copy, shared
storage, and a broad arbitrary-file native API. No external driver or vendor SDK
is required.

## 12. Android API-level installer and file-authority contract

The future implementation uses Android's normal system package installer UI.
The expected launch mechanism is an Android-supported package-view/install
intent with:

- MIME type `application/vnd.android.package-archive`;
- an app-owned FileProvider `content://` URI;
- temporary read permission granted to the system installer;
- no `file://` URI;
- no root, shell, ADB, accessibility, or silent-install mechanism.

The future production implementation will declare
`android.permission.REQUEST_INSTALL_PACKAGES`; A4.3A does not add that
permission.

### API 26 and newer

- Query `PackageManager.canRequestPackageInstalls()` only on this API branch.
- When false, enter `installPermissionRequired` and do not launch an installer.
- On explicit user action, the app may open the Android per-app unknown-source
  settings page for `com.pianofundamentals.trainer`.
- After the user returns, query `canRequestPackageInstalls()` again. Opening
  Settings is never treated as proof that permission was granted.
- When true, return to `readyToInstall`; the user must explicitly tap Install.

### API 24-25

- Never reference or call the API-26-only
  `PackageManager.canRequestPackageInstalls()` path.
- There is no Android-O-style per-source authorization model to query.
- Use only an API-compatible normal system package-installer intent with the
  verified FileProvider content URI and explicit user confirmation.
- Do not read, write, toggle, or attempt to automate the legacy global
  unknown-source setting. Do not use privileged APIs.
- If platform or OEM security settings block the public installer flow, fail
  safely with sanitized install-permission/install-launch guidance. Do not
  silently install and do not claim a capability that cannot be preflighted.

API 24-25 therefore has a documented limitation: public APIs do not provide the
same reliable per-source preflight query available on API 26+. The actual normal
system installer launch is the authoritative capability check on this branch.
Future implementation must run API 24-25 device/emulator compatibility QA. If
the supported public flow cannot provide reliable updater operation, stop for a
product decision before narrowing updater support. Never silently raise
`minSdkVersion=24`.

### FileProvider authority

The authority chain is fixed:

```text
native VERIFIED artifact
  -> narrowly scoped FileProvider content:// URI
  -> FLAG_GRANT_READ_URI_PERMISSION
  -> normal Android system package installer
```

FileProvider configuration must expose only the dedicated verified-updater
artifact directory (or a narrower single-artifact scope), not a cache root,
files root, arbitrary application-private files, or any shared-storage root.
It grants read-only access to the intended verified APK. `file://` is never
used.

Launching the intent means only `installerLaunched`. It is not evidence that the
user accepted installation or that Android completed it.

## 13. Threat model

| Threat | Detection | Containment | Normal user-visible outcome |
| --- | --- | --- | --- |
| T1 malicious/compromised manifest | strict schema, package/version/HTTPS checks; later archive and signer checks | reject malformed policy; manifest alone grants no install authority | update verification failed or no valid update |
| T2 APK modified in transit or cache | byte count and local SHA-256 mismatch | hard fail; delete/quarantine; never authorize installer | downloaded update could not be verified; retry |
| T3 wrong-package APK | PackageManager archive package name differs | hard fail; no installer launch | update package is invalid |
| T4 correctly hashed wrong-signer APK from compromised host | archive current signer digest differs from application-owned pin | hard fail with no bypass; manifest cannot change pin | update signature could not be verified |
| T5 downgrade/replayed manifest | manifest/archive versionCode is equal to or lower than installed | no downgrade offer; delete obsolete artifact | already up to date / no newer update |
| T6 corrupted or partial download | `.part` lifecycle, completed byte count, digest/archive parse | partial never installable; cleanup and fresh retry | download incomplete or verification failed |
| T7 installer permission unavailable | Android capability/status query | stay in app; only open official settings; no fake state | permission guidance and Open settings action |
| T8 network unavailable | manifest/download timeout and transport error | updater-only error; practice/storage/MIDI remain operational | cannot check/download now; retry later |
| T9 app killed during download | `.part` marker and absence of live verified authorization | remove partial on restart; completed file must fully reverify | update returns to idle or offers fresh retry |
| T10 malformed future schema | schemaVersion differs from 1 or fields violate strict schema | fail closed; do not infer compatibility | update information is not supported by this app version |
| T11 verified-artifact TOCTOU | launch-time opaque-token-to-artifact binding and invariant validation detects replacement, mutation, supersession, cleanup, or stale authorization | invalidate token; create no installer authority; require the full verification chain again | verification expired; retry verification |
| T12 unsupported platform install API | explicit `Build.VERSION`/capability branching plus API-specific installer and signer paths | never invoke an unavailable API; return sanitized unsupported/permission state while the core app remains usable | updater-specific safe error or guidance |

Additional containment rules:

- release notes are plain text and cannot inject markup;
- normal logs/UI never include raw native exceptions or private paths;
- installer authority is an opaque, short-lived verified token;
- updater failure never mutates Sight Reading reports, settings, MIDI state, or
  History;
- no network operation starts until the user explicitly checks or downloads.

## 14. Deterministic implementation test plan

These tests are specified but are not implemented in A4.3A.

| ID | Future deterministic assertion |
| --- | --- |
| UP01 | equal installed/manifest version produces no update |
| UP02 | valid newer schemaVersion 1 manifest produces update available |
| UP03 | older manifest is rejected as a downgrade/replay and never offered |
| UP04 | equal version produces neutral no-update state |
| UP05 | malformed JSON/fields are rejected with `MANIFEST_INVALID` |
| UP06 | unsupported schema is rejected without fallback |
| UP07 | wrong manifest package is rejected |
| UP08 | HTTP or non-HTTPS APK URL is rejected |
| UP09 | local APK SHA mismatch deletes/disables artifact |
| UP10 | completed byte count mismatch deletes/disables artifact |
| UP11 | downloaded APK package mismatch blocks installer |
| UP12 | APK/manifest version mismatch blocks installer |
| UP13 | downloaded version less than or equal to installed is rejected |
| UP14 | wrong permanent signer is rejected with no bypass |
| UP15 | Android Debug signer is rejected |
| UP16 | exact permanent-signed newer APK passes every verification stage |
| UP17 | manifest network failure is isolated from the application |
| UP18 | download network failure cleans partial and is retryable |
| UP19 | malformed APK archive is rejected |
| UP20 | missing unknown-source permission yields only permission-required state |
| UP21 | installer launch failure is sanitized and does not claim success |
| UP22 | practice remains usable with no network |
| UP23 | updater has no operation capable of clearing persistence |
| UP24 | existing History records survive a normal permanent-signed in-place upgrade |
| UP25 | Release build contains no development update bypass |
| UP26 | API 26+ with install permission false enters `installPermissionRequired` |
| UP27 | API 26+ with install permission true can proceed only from a verified artifact |
| UP28 | API 24-25 path never calls the API-26-only install-capability API |
| UP29 | archive current-signer inspection succeeds through the required API 24-27 legacy path |
| UP30 | a verified token cannot authorize an arbitrary path, URI, URL, or manifest |
| UP31 | an artifact changed or replaced after verification is rejected before installer launch |
| UP32 | process restart invalidates every previously issued verified token |
| UP33 | selecting a newer/different update invalidates the previous artifact token |
| UP34 | FileProvider exposes only the intended verified-updater artifact scope and grants read-only access |

Additional architecture tests required during implementation:

- all illegal state transitions are rejected;
- `readyToInstall` cannot be created without every verification result;
- installer launch accepts only a live native verified-artifact token;
- process restart invalidates the token and requires full re-verification;
- API 24-25 bytecode/execution never reaches API-26-only install capability;
- API 24-27 signer inspection never reaches `SigningInfo`;
- launch-time artifact invariant uncertainty invalidates authorization;
- redirects cannot downgrade HTTPS;
- duplicate/unknown manifest fields and oversized responses fail closed;
- release notes remain plain text;
- cancellation and retry never expose a partial artifact;
- normal UI receives only sanitized categories;
- no updater module imports or modifies `src/sightReading`.

Real end-to-end Human QA later also must confirm the Android system permission
and installer flow, installed version after relaunch, permanent data survival,
and an actual permanent-signed versionCode increment.

## 15. Existing approved Update UI fit and gaps

The current approved screen consists of:

- existing product header/back navigation;
- one centered Update card;
- state illustration and eyebrow;
- headline and supporting copy;
- two key/value rows;
- one primary action;
- a small status/disclaimer line.

The existing hierarchy can represent `idle`, `checking`, `upToDate`,
`verifying`, `readyToInstall`, `installerLaunched`, and concise `error` states by
binding real state and copy. The Settings entry and navigation do not need
redesign.

Exact localized gaps for the later implementation:

1. `updateAvailable` needs a bounded plain-text release-notes area. Long notes
   must scroll or expand inside the card without changing application hierarchy.
2. `downloading` needs determinate byte/percentage progress and, if cancellation
   is implemented, a secondary Cancel action.
3. retryable errors need a primary Retry action whose target is determined by
   the state machine, not arbitrary UI logic.
4. `installPermissionRequired` needs concise guidance and one action that opens
   the Android system settings page.
5. current prototype version/time strings and Mock disclaimer must later bind to
   installed package metadata and real updater state.

These are in-card functional additions, not justification for a material
redesign. Any change to the approved navigation, overall tablet information
hierarchy, card composition/scale, or a release-notes layout that materially
changes the screen requires explicit Human UI Review. A4.3A makes no UI change.

## 16. UPDATE-HOST-001

Status: **OPEN**

Before real-network updater Human QA, provide:

1. one publicly reachable HTTPS manifest URL; and
2. one publicly reachable HTTPS APK URL for a permanent-signed APK.

The hosting provider is deliberately not selected by this architecture. No
artifact is published in A4.3A. The provider must support stable HTTPS delivery
and the frozen schema/verification chain, but no vendor-specific API is part of
the updater contract.

Resolution trigger: immediately before updater real-network Human QA.

## 17. Protected product boundaries

Updater implementation must not modify or become a source of truth for:

- Sight Reading contracts, judgement, or notation;
- Bluetooth MIDI or FP-30X lifecycle;
- Android settings/report persistence or schemaVersion 1;
- real History projection;
- package ID or permanent signing identity;
- Golden MusicXML/MIDI fixtures;
- approved tablet navigation or practice composition.

Offline Sight Reading, History, Settings, and Bluetooth MIDI remain usable even
when every updater operation fails.

## 18. A4.3A completion boundary

A4.3A stops at this reviewed specification. It does not add tests, production
source, native plugin code, manifest permissions, network access, downloads,
installer behavior, hosting, package-version increments, or commits.

Implementation may start only after Human Review approves this contract.
