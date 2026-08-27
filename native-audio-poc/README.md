# Phase F3.0c Native WASAPI Shared POC

This directory is an isolated feasibility prototype. It does not replace the
production WebAudio sampler and does not implement pitch mapping, CC64, note-off
handling, or production polyphony. It is development-only: packaged builds do
not start or expose this helper.

The helper opens the FiiO K11 through miniaudio's WASAPI Shared backend at a
48 kHz application rate. Every MIDI note-on retriggers exactly one predecoded
C4 stereo float32 PCM sample. The OGG file is decoded and resampled only by the
build-time sample compiler; the helper loads the resulting PCM once before the
audio device starts.

## Build

```powershell
npm run poc:native-audio:build
```

The CMake build pins miniaudio 0.11.25 and a fixed stb commit. It requires the
Windows SDK and Visual Studio 2022 Build Tools, but does not use node-gyp or a
Node native addon.

## Automated 1000-event validation

Build the Electron renderer first, then run the deterministic MIDI-path harness:

```powershell
npm run build
npm run poc:native-audio:auto
```

The harness injects a virtual Web MIDI input into the real `useMidi` callback,
keeps production WebAudio disabled, sends at least 1000 note-on messages, and
prints the helper's device and percentile reports.

## Human-device run

```powershell
$env:PIANO_NATIVE_AUDIO_POC = '1'
npm run dev
```

Turn the normal built-in piano sound off in Settings before comparing the POC.
The POC bridge remains independent of that production preference. The terminal
prints a report after each 1000 consumed note-on events.

F3.1 finalization keeps this source only as the archived AUDIO-002 diagnostic.
The tested K11 WASAPI Shared endpoint reported an approximately 10 ms minimum
engine period. Do not repeat Shared-mode library experiments without new device
or driver evidence. This POC never forwards MIDI to Garritan.
