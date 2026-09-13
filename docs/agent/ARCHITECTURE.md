# ARCHITECTURE

> **Legacy Windows/Electron architecture.** This file documents the desktop
> renderer and is not the architecture inventory for the Android tablet app.
> See `ANDROID_PROJECT_STATE.md` for the current Android product boundary.

## MIDI

`Web MIDI callback → parseMidiMessage → publishMidiEvent → practice hook subscription`

- Every event gets a monotonic unique id in `useMidi`.
- `noteOn velocity=0` converts to `noteOff`; CC64 preserved as `controlChange`.
- Subscribers baseline at mount; pause/unmount isolation; StrictMode-safe unsubscribe.
- React state (`recentEvents`, `latestEvent`, `activeNotes`) reserved for UI.

## Audio

- `PianoSampler` (Web Audio): sample voices from SFZ anchors (`samplePackLoader`) with playbackRate pitch shifting; synthesized fallback when no pack; polyphony + voice stealing (`voicePolicy`); CC64 sustain/pedal release; master piano volume; cleanup.
- Audio mode: builtin / silent / external (persisted `audioModeSettings`), default builtin.
- `usePianoAudio` subscribes to the MIDI event bus (never `latestEvent`); `useAudioEngine` is a compatibility wrapper.
- Sample pack location: `assets/samples/salamander` (Salamander Grand Piano V2, CC BY 3.0). CONTENT PARTIAL until user provides/imports the pack.

## Practice Engine

- `usePracticeEngine`: generic target timeline engine used by rhythm + judgement test.
- `ScalePracticeCore`: pure class, target time points + early/late windows, missed-on-window-end with advance.
- Chord: `chordFeedback` pure functions; 150ms block input window; arpeggio ordered state machine.
- Sight-reading: `SightReadingSessionCore` pure session machine (display→answering→feedback), fixed 5s, 32ms unlock, 350ms advance.

## Curriculum

- `curriculum/curriculumTypes.ts` + `curriculumCatalog.ts`: books (Hanon metadata-only, Czerny 100 directory, real scale + coordination exercises); no fabricated notes.
- `curriculumProgress.ts`: v1 progress storage, corrupt-safe, attempt recording.
- Free practice: `midiRecording` (facts only) + `PlaybackCursorCore`; `useFreePractice` records bus events and plays back via `PianoSampler`.
- Planned: curriculum practice mode (uses ScalePracticeCore), old entry removal after hardware validation, MusicXML-based books.

## Chord/Harmony

- `chordV2/`: identity (root/quality/required+optional pitch classes) → voicing (exactNotes/register/doubling/spacing/bassConstraint) → texture (block window 150ms / ordered arpeggio state machine / composite) → harmony context (I/IV/V verified, voice-leading heuristic).
- Symbol parser supports standard set incl. slash chords and ♭.
- Layered judgment: identity (pitch-class), inversion (lowest note), exact (pitch-set equality).
- Stage 4 will add progression + 4536251 + arrangement on top of these layers.

## Harmony / 4536251

- `harmony/progressions.ts`: diatonic progression definitions (4536251 = IV-V-iii-vi-ii-V-I etc.), roman numerals, verified I/IV/V functions, smooth-bass voicing selection, step judgment.
- `harmony/arrangement.ts`: texture candidate generation + playability validation + voice-leading scoring [HEURISTIC]; `ArrangementVariation` output is advisory, never hard-judged.

## Score

- `score/xmlMiniParser.ts` (no deps) → `musicXmlParser.ts` (part/measure/note/rest/chord/tie/voice/staff/key/time/tempo/accidental) → `scoreTimeline.ts` (onset units) → `waitScoreCore.ts` (Wait engine).
- `zipReader.ts` reads stored-ZIP MXL containers (deflate unsupported → clear error).
- `practiceSegment.ts` v1 storage; `ScorePracticePage` with demo score + import + Wait practice.

## Follow

- `realtimeScoreCore.ts`: continuous time, windows, missing/extra, cursor advance (no permanent misalignment).
- `followScoreCore.ts`: beam search with time/pitch/skip costs; stop/resume/slow/fast/skip/extra/repeat.
- `useScorePractice(score, mode)` unifies Wait/Realtime/Follow in one hook.

## Plan / Analytics

- `plan/planV2.ts`: profile + goals; v1→v2 migration preserves legacy fields.
- `analytics/periodStats.ts`: period stats, confidence, no-data rules, weekly report (facts vs suggestions).

## Storage

- `practiceRecordStorage` (v1), `sightReadingSettings` (v4), `displayPreferences` (v2), `themeStorage`, `trainingPlanStorage` (v1). Migration strategy documented in DATA_MIGRATIONS.md.

## Analytics

- Planned (Stage 6): period stats, confidence/sampleCount, no-data display rules.

## AI

- `ai/aiProvider.ts`: OpenAI-compatible client (key in Authorization header only).
- `ai/aiSettings.ts`: local settings v1; `toSafeAiSettingsExport` never includes the key.
- `ai/aiCoach.ts`: structured snapshots → system/user prompts → layered JSON output → validation (no record mutation / auto-promotion claims) → fallback.
- `ai/musicAi.ts`: deterministic variation generation passed through playability + voice-leading validation [HEURISTIC].

## Storage / Backup

- `storage/backup.ts`: unified backup (schemaVersion 1, appVersion, createdAt); AI key excluded from export; restore validates structure before writing; invalid input never destroys existing data.
- `storage/firstRun.ts`: onboarding flag.
