# Asset provenance

## Official Android application artwork

The pinned source for the official Android launcher artwork is:

`artwork/approved/android-app-icon-source.png`

SHA-256:

`4BC8EA53852A16F2B5704CF7C5FC03A85C0F4A7287A15AC6E0A787D21817BBD1`

Repository records establish this as project-directed, project-approved artwork used by the official Android application. The records do not identify a human artist, so none is attributed here. The public snapshot makes no broader claim about the creation process.

`scripts/generate-android-launcher-icons.py` verifies the pinned hash and creates the density-specific normal, round and adaptive launcher resources under `android/app/src/main/res/`. Those generated resources are derivatives of the official artwork.

The retained splash PNG resources form part of the approved official Android presentation at the frozen 1.4.0 checkpoint. They and the launcher artwork are project branding and are excluded from the Apache-2.0 source-code grant unless explicitly authorized separately. See `BRANDING.md`.

## Music notation assets

The Android bundle obtains the Bravura music font through `@vexflow-fonts/bravura`. Bravura remains under SIL Open Font License 1.1; its full license is retained under `third_party/licenses/`.

## Excluded assets

- Private Golden MusicXML/MIDI fixtures are not included.
- Salamander/Yamaha C5 samples are not included because the Android application has no internal sample-based sound.
- Internal Human QA screenshots and generated preview images are not included.

New public music, images, fonts or recordings must include documented origin and public redistribution permission before they are committed.
