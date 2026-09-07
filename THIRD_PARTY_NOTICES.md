# Third-party notices

This file describes third-party components present in the Android-focused public source snapshot. Project-created source code is licensed under Apache-2.0; that license does not replace the licenses below.

## JavaScript runtime dependencies

| Component | Snapshot version | License | Use |
| --- | ---: | --- | --- |
| Capacitor Android/Core/App/Preferences | 8.5.0 / 8.1.1 / 8.0.1 | MIT | Android bridge, lifecycle and local preferences |
| React / React DOM | 18.3.1 | MIT | User interface |
| VexFlow | 5.0.0 | MIT | Music notation layout and SVG rendering |
| Bravura | 1.0.2 | SIL Open Font License 1.1 | Local SMuFL notation font |

Corresponding license texts are retained in `third_party/licenses/`. The Bravura Reserved Font Name requirements continue to apply to modified font versions.

## Android and build dependencies

The Android application resolves AndroidX, Kotlin, Apache Cordova and Android build components through Gradle. Principal locally resolved metadata identifies these components as Apache License 2.0. JUnit 4.13.2 is used only for tests under Eclipse Public License 1.0. Capacitor project code is MIT licensed.

See `docs/DEPENDENCY_LICENSES.md` for the audited direct inventory and the boundary of local evidence. Dependencies downloaded by npm or Gradle are not vendored merely by this source snapshot; binary distributors remain responsible for preserving all notices required by their resolved dependency versions.

## Deliberately excluded material

The Android application has no internal piano-sample sound. Salamander Grand Piano samples and the Windows native-audio experiment are not present in this Android-focused snapshot and are therefore not bundled components of this repository.

Private Golden MusicXML/MIDI fixtures are also excluded and are not licensed or distributed by this public snapshot.
