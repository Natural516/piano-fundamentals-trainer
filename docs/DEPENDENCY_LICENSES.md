# Dependency license inventory

This inventory was produced from the Phase 2 staging tree's `package-lock.json`, installed npm package metadata, Gradle dependency graphs, and locally resolved POM metadata. It is an auditable snapshot, not legal advice.

## Direct npm runtime dependencies

| Package | Resolved version | License |
| --- | ---: | --- |
| @capacitor/android | 8.5.0 | MIT |
| @capacitor/app | 8.1.1 | MIT |
| @capacitor/core | 8.5.0 | MIT |
| @capacitor/preferences | 8.0.1 | MIT |
| @vexflow-fonts/bravura | 1.0.2 | OFL-1.1 |
| react | 18.3.1 | MIT |
| react-dom | 18.3.1 | MIT |
| vexflow | 5.0.0 | MIT |

## Direct npm development dependencies

| Package | Resolved version | License |
| --- | ---: | --- |
| @capacitor/cli | 8.5.0 | MIT |
| @types/node | 20.19.43 | MIT |
| @types/react | 18.3.31 | MIT |
| @types/react-dom | 18.3.7 | MIT |
| @vitejs/plugin-react | 4.7.0 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| vite | 5.4.21 | MIT |

The cleaned lockfile contains 221 package entries. No GPL, AGPL, LGPL or non-commercial license was reported by the installed npm metadata scan. Transitive metadata includes permissive MIT, ISC, Apache-2.0, BSD, BlueOak, 0BSD, Unlicense and similar entries, plus OFL-1.1 and a CC-BY-4.0 browser-compatibility dataset. Compound and data-license entries must remain covered by any future automated binary-notice process.

## Android and Gradle

Locally resolved POM evidence identifies:

| Component | Version | License |
| --- | ---: | --- |
| Kotlin standard library | 2.0.21 resolved | Apache-2.0 |
| AndroidX AppCompat | 1.7.1 | Apache-2.0 |
| AndroidX CoordinatorLayout | 1.3.0 | Apache-2.0 |
| AndroidX Core SplashScreen | 1.2.0 | Apache-2.0 |
| AndroidX WebKit | 1.14.0 | Apache-2.0 |
| Apache Cordova Android framework | 14.0.1 | Apache-2.0 |
| Android Gradle Plugin | 8.13.0 | Apache-2.0 |
| Kotlin Gradle Plugin | 1.9.22 | Apache-2.0 |
| Google Services Gradle Plugin | 4.4.4 | Apache-2.0 |
| AndroidX Test JUnit | 1.3.0 | Apache-2.0 |
| AndroidX Espresso Core | 3.7.0 | Apache-2.0 |
| JUnit (test only) | 4.13.2 | EPL-1.0 |

The Android test dependency graph was explicitly resolved during staging so the previously unavailable AndroidX Test/Espresso license metadata is no longer unresolved.

## Retained full texts

- `third_party/licenses/Apache-2.0.txt`
- `third_party/licenses/Capacitor-MIT.txt`
- `third_party/licenses/React-MIT.txt`
- `third_party/licenses/VexFlow-MIT.txt`
- `third_party/licenses/Bravura-OFL-1.1.txt`

The root Apache-2.0 license covers project-created source only. Each third-party component remains under its own terms. Binary distributors should regenerate a complete resolved-dependency notice for the exact toolchain and package lock used to build their artifact.
