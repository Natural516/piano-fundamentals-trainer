# Phase F3.0 Built-in Piano Sample Source Migration

## Reference provenance

- Reference project snapshot: `03_piano-trainer-studio`
- Reference implementation: `js/trainer-core.js`
- Reference assets: `assets/audio/salamander`
- Instrument: Salamander Grand Piano V2 / Yamaha C5
- Author: Alexander Holm
- License: CC BY 3.0

The migrated mapping is the reference implementation's exact set of 30
minor-third sample anchors from A0 through C8. The 30 OGG files are copied
byte-for-byte. Their combined size is 6,941,896 bytes (6.62 MiB). The MP3
duplicates from the reference directory are not bundled because Electron's
Chromium runtime decodes the OGG set directly.

## Migration and Electron adaptation

Migrated without product redesign:

- 30-note Salamander/Yamaha C5 anchor mapping
- OGG sample assets
- startup preload/decode cache
- velocity-sensitive gain
- one-second note release behavior
- original README and CC BY attribution

Adapted for this Electron application:

- each noteOn owns a distinct voice ID for repeat-note and chord polyphony
- CC64 holds released keys until pedal-up, followed by a release envelope
- Panic immediately clears every source and pedal state
- the audio subscriber and judgement subscribers independently consume the
  same per-event MIDI bus
- missing resources are explicit errors; there is no synthesized fallback
- the former `external` stored setting migrates to `silent`

## Resource locations

- Development source root: `resources/piano-samples/salamander`
- Packaged root: `resources/piano-samples/salamander` beneath Electron's
  `process.resourcesPath`
- Windows unpacked example:
  `release/win-unpacked/resources/piano-samples/salamander`

Samples are copied with electron-builder `extraResources`, so they remain
outside `app.asar`. The renderer cannot resolve arbitrary file paths; preload
exposes a constrained IPC reader and the main process rejects absolute paths,
empty segments, backslashes, and traversal.

## Product boundary

The product exposes only `内置钢琴`, `关闭`, volume, and `试听`. It neither
detects nor starts an external sound source and performs no MIDI forwarding.
Disabling built-in audio does not unsubscribe judgement or recording from the
MIDI event bus.

Human audio QA with the Roland FP-30X remains required before the feature can
be signed off.
