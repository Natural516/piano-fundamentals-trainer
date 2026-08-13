# ARCHITECTURE

## MIDI

`Web MIDI callback → parseMidiMessage → publishMidiEvent → practice hook subscription`

- Every event gets a monotonic unique id in `useMidi`.
- `noteOn velocity=0` converts to `noteOff`; CC64 preserved as `controlChange`.
- Subscribers baseline at mount; pause/unmount isolation; StrictMode-safe unsubscribe.
- React state (`recentEvents`, `latestEvent`, `activeNotes`) reserved for UI.

## Audio

- Not yet implemented (Stage 1). Planned: `PianoSampler` (Web Audio), sample anchors + nearest selection + playbackRate pitch shifting, velocity gain, polyphony, voice stealing, CC64 sustain, cleanup, volume control, audio mode (built-in / silent / external).

## Practice Engine

- `usePracticeEngine`: generic target timeline engine used by rhythm + judgement test.
- `ScalePracticeCore`: pure class, target time points + early/late windows, missed-on-window-end with advance.
- Chord: `chordFeedback` pure functions; 150ms block input window; arpeggio ordered state machine.
- Sight-reading: `SightReadingSessionCore` pure session machine (display→answering→feedback), fixed 5s, 32ms unlock, 350ms advance.

## Curriculum

- Planned (Stage 2): Curriculum/Book/Chapter/Exercise/Section model; Hanon + Czerny 599 frameworks; migrate scale + coordination engines into curriculum capability.

## Chord/Harmony

- Planned (Stage 3/4): Chord Identity → Bass/Inversion → Voicing → Texture → Voice Leading → Harmony Context; progression + 4536251.

## Score

- Planned (Stage 5): MusicXML subset parser; Wait mode; fixtures.

## Follow

- Planned (Stage 6): Realtime alignment + Follow Me cursor alignment.

## Storage

- `practiceRecordStorage` (v1), `sightReadingSettings` (v4), `displayPreferences` (v2), `themeStorage`, `trainingPlanStorage` (v1). Migration strategy documented in DATA_MIGRATIONS.md.

## Analytics

- Planned (Stage 6): period stats, confidence/sampleCount, no-data display rules.

## AI

- Planned (Stage 7): OpenAI-compatible provider abstraction, key safety, facts→interpretation→recommendation layering.
