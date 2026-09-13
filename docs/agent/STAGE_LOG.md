# STAGE_LOG

> **Legacy Windows/Electron stage log.** These stages are retained as desktop
> history and must not be treated as implemented Android features or the next
> Android stage. See `ANDROID_PROJECT_STATE.md` for current Android status.

## Stage 0 — MIDI per-event layer + scale time-axis + report cleanup

- Goal: fix MIDI multi-event loss (P0), scale 8/8 missed (P1), simplify sight-reading report, unify report back action, add real event-chain tests.
- Implementation:
  - `midi/midiEventBus.ts`, `midi/midiMessages.ts`, `hooks/useMidiEvents.ts`.
  - `useMidi` publishes each parsed record to the bus.
  - All practice hooks subscribe to the bus; `latestEvent` no longer used for judgment.
  - `utils/scalePracticeCore.ts` pure time-axis core; `useScalePractice` rewired.
  - `utils/chordFeedback.ts` pure feedback; `useChordPractice` rewired.
  - `PracticeReportModal` shared back/repeat; five pages updated; sight-reading report simplified.
- Tests: regression 41 → 55.
- Verification: typecheck 0, build 0, regression 55/55, diff --check 0.
- Unverified: Roland FP-30X hardware round 2; visual layout of report modal.
- Commit: pending (stage0 automated complete, hardware QA pending).

## Stage 0.5 checkpoint

- Commit: `5bf63b4` checkpoint: stage0 automated complete, hardware QA pending.
- All gates green: typecheck 0, build 0, regression 55/55, diff --check 0.

## Stage 1 — built-in piano audio

- Goal: software can produce piano sound without external VST; sample-pack engine + audio mode + independent volume.
- Implementation:
  - `audio/pianoAudioTypes.ts` — audio mode, sample anchor, sampler status types.
  - `audio/samplePackLoader.ts` — minimal SFZ subset parser, nearest-anchor selection, playbackRate pitch shift, velocity gain.
  - `audio/voicePolicy.ts` — pure polyphony/stealing/sustain helpers.
  - `audio/pianoSampler.ts` — Web Audio `PianoSampler`: sample voices + synthesized fallback, retrigger, voice stealing, CC64 sustain/pedal release, master volume, cleanup.
  - `audio/audioModeSettings.ts` — persisted audio mode (default builtin) + piano volume.
  - `hooks/usePianoAudio.ts` — bus-subscribed audio hook; loads Salamander pack when present at `assets/samples/salamander`, else fallback synth; `useAudioEngine.ts` now a compatibility wrapper.
  - Settings page: 音频/钢琴发声 card (mode segmented, piano volume slider, sample status, 测试发声).
- Tests: regression 55 → 60 (SFZ parsing, anchor selection/pitch, audio mode settings, voice policy, bus wiring).
- Verification: typecheck 0, build 0, regression 60/60, diff --check 0.
- Unverified / pending: Salamander real samples (CONTENT PARTIAL — no local pack found), actual listening latency, sustain pedal feel, long-session stability (HARDWARE/AUDIO/HUMAN QA PENDING).
- Commit: `stage1 built-in piano audio` (next).

## Stage 2 — free practice + curriculum

- Goal: free-play with factual recording/report; MIDI recording + playback; curriculum model (Hanon/Czerny frameworks, scale/coordination inheritance); progress storage.
- Implementation:
  - `curriculum/curriculumTypes.ts` — CurriculumBook/Exercise, TechniqueTag, ExerciseProgress, PracticePrescription.
  - `curriculum/curriculumCatalog.ts` — Hanon (10 metadata exercises, CONTENT PARTIAL), Czerny 599 (100-entry directory, no guessed tags), scale book (real 12-major exercises from existing engine), coordination book (real timelines).
  - `curriculum/curriculumProgress.ts` — v1 storage with corrupt/unknown fallback and attempt recording.
  - `midi/midiRecording.ts` — recording session, factual stats (duration/range/velocity/pedal/density/left-right), playback timeline + `PlaybackCursorCore` (seek/advance/speed).
  - `hooks/useFreePractice.ts` — bus-subscribed recorder + playback loop (play/pause/replay/seek/speed).
  - `components/FreePracticePage.tsx` — start/pause/continue/finish, fact report, playback controls, notes, virtual keyboard; record saved as `free-practice` module.
  - `PracticeModule` extended with `free-practice` (record types/storage/adapters/history tones); display preferences add `free-practice` scope.
- Tests: regression 60 → 65 (recording capture/stats, playback timeline/seek, curriculum catalog integrity + no fabricated notes, progress migration, free record adapter).
- Verification: typecheck 0, build 0, regression 65/65, diff --check 0.
- Not done (honest): old scale/coordination entries NOT removed — curriculum practice mode + hardware validation still pending before entry removal; Hanon/Czerny structured scores CONTENT PARTIAL; free-play playback latency/feel HUMAN/HARDWARE QA PENDING.
- Commit: `stage2 free practice and curriculum` (next).

## Stage 3 — chord practice V2

- Goal: structural chord model (Identity → Bass/Inversion → Voicing → Texture → Harmony), layered judgment, chord symbol UI with local keyboard.
- Implementation:
  - `chordV2/chordV2Types.ts` — qualities, difficulties L1-L7, judge modes, VoicingSpec, HarmonyContext.
  - `chordV2/chordIdentity.ts` — quality definitions (required/optional pitch classes, extensions/alterations), standard symbol formatting + parsing (incl. slash chords and ♭), octave-agnostic identity.
  - `chordV2/voicing.ts` — default voicing builder (register/doubling/spacing/bassConstraint), layered judgment (identity/inversion/exact), `ArpeggioStateMachine`, arpeggio sequence builder.
  - `chordV2/harmony.ts` — [VERIFIED] I/IV/V function in major, scale degree, voice-leading heuristic [HEURISTIC].
  - `hooks/useChordV2Practice.ts` — bus-subscribed practice engine: 150ms block window, ordered arpeggio, composite texture, question generator, report.
  - `components/ChordV2Page.tsx` + `components/MiniKeyboard.tsx` — chord symbol + voicing + local 3-octave keyboard; settings (judge mode/inversion/texture/difficulty/count); App routes `chords` → V2.
- Tests: regression 65 → 71 (identity model, symbol parse/format, layered voicing judgment, arpeggio machine, harmony/voice-leading, page wiring).
- Verification: typecheck 0, build 0, regression 71/71, diff --check 0.
- Pending: musicality of voicings (MUSICAL QA), real-hardware block/arpeggio feel (HARDWARE QA), progression/4536251 (stage 4), old chord page kept for stage 4 content.
- Commit: `stage3 chord practice v2` (next).

## Stage 4 — harmony progressions + 4536251 + arrangement

- Goal: progression training and arrangement candidates built on the chord V2 layers.
- Implementation:
  - `harmony/progressionTypes.ts` — ProgressionDefinition/Model/StepModel, ArrangementVariation, 5 progression ids.
  - `harmony/progressions.ts` — diatonic definitions (4536251 = IV-V-iii-vi-ii-V-I, I-IV-V-I, I-V-vi-IV, ii-V-I, I-vi-IV-V), roman numerals, I/IV/V function, smooth-bass voicing, step symbol + judgment.
  - `harmony/arrangement.ts` — texture candidates (block/arpeggio), playability validation (range/spacing), voice-leading scoring [HEURISTIC], variation generator.
  - `hooks/useProgressionPractice.ts` — bus-subscribed step engine (block window / ordered arpeggio), per-step results, report.
  - `components/ProgressionPracticePanel.tsx` — progression/key/texture controls, step display, mini keyboard, feedback, report; ChordV2Page content toggle (单和弦 / 进行训练).
- Tests: regression 71 → 75 (definitions/degrees/functions, roots per key, step symbol/judgment, arrangement validation + scoring, wiring).
- Verification: typecheck 0, build 0, regression 75/75, diff --check 0.
- Pending: musicality of 4536251 voicings (MUSICAL QA), real-hardware step timing (HARDWARE QA), more progression catalog (extensible definitions).
- Commit: `stage4 harmony progressions and 4536251` (next).

## Stage 5 — score practice 1.0 (MusicXML + Wait)

- Goal: MusicXML/MXL subset parsing, score model, Wait-mode practice, practice segments, fixtures.
- Implementation:
  - `score/xmlMiniParser.ts` — dependency-free XML tree parser (attributes/text/comments/CDATA/entities).
  - `score/musicXmlTypes.ts` + `musicXmlParser.ts` — part/measure/note/rest/chord/tie/voice/staff/key/time/tempo/accidental; MIDI from step+alter+octave.
  - `score/zipReader.ts` — minimal stored-ZIP reader + `createStoredZip` (MXL containers).
  - `score/scoreTimeline.ts` — onset grouping (chords/multi-voice), rest and tie units.
  - `score/waitScoreCore.ts` — Wait engine: advance only when required new-onset notes satisfied; rests/tie-only auto-skip; ties keep sounding.
  - `score/practiceSegment.ts` — segment storage v1 (scoreId/measures/tempo/hand/mode/loop).
  - `hooks/useScoreWaitPractice.ts` + `components/ScorePracticePage.tsx` — built-in demo score, .xml/.musicxml/.mxl import, Wait practice with mini keyboard, segment save.
  - New `score-practice` page id, home card, route.
- Fixtures: `scripts/score-fixtures/` (single melody, chord/tie/rest, accidental/key change).
- Tests: regression 75 → 84 (XML parser, MusicXML parsing, timeline grouping, Wait core, stored MXL, segment storage, wiring).
- Verification: typecheck 0, build 0, regression 84/84, diff --check 0.
- Pending: notation rendering (VexFlow multi-measure), Realtime/Follow (stage 6), real-score content (HUMAN QA), MXL deflate support (stored-only now).
- Commit: `stage5 score practice 1.0` (next).

## Stage 6 — Realtime/Follow + plan 2.0 + analytics

- Goal: continuous-time score judgment, follow-me alignment, plan v2 migration, factual analytics.
- Implementation:
  - `score/realtimeScoreCore.ts` — continuous timeline with on-time/early/late windows, missing/extra recording, cursor advances so one error does not permanently misalign.
  - `score/followScoreCore.ts` — beam of position candidates with time/pitch/skip costs; stop/resume, slow/fast, skip, extra and repeat handled by local search.
  - `plan/planV2.ts` — v2 plan state with profile/goals; `migratePlanV1ToV2` preserves v1 legacy data; corrupt-safe storage.
  - `analytics/periodStats.ts` — today/week/month/all stats, per-module accuracy, confidence (sample count), no-data rules, weekly report with facts/suggestions separated.
  - `hooks/useScorePractice.ts` — unified Wait/Realtime/Follow hook (replaces direct Wait usage; `useScoreWaitPractice` is a wrapper).
  - `ScorePracticePage` mode toggle (Wait/Realtime/Follow); `AnalyticsPage` + route.
- Tests: regression 84 → 89 (Realtime windows/missing/extra, Follow recovery, plan v2 migration, period stats + weekly report, wiring).
- Verification: typecheck 0, build 0, regression 89/89, diff --check 0.
- Pending: real-hardware Follow feel (HARDWARE QA), tempo-based beat duration wiring from MusicXML tempo (currently fixed 500ms in cores), full plan 2.0 UI.
- Commit: `stage6 score following plan and analytics` (next).

## Stage 7 — AI coach

- Goal: OpenAI-compatible provider abstraction, key safety, facts→interpretation→recommendation, validated music-AI variations.
- Implementation:
  - `ai/aiTypes.ts`, `ai/aiSettings.ts` — settings v1 (endpoint/model/temperature/timeout/maxTokens), local-only API key, `toSafeAiSettingsExport` strips the key.
  - `ai/aiProvider.ts` — `createOpenAiCompatibleClient` (fetch, Authorization header only, timeout, HTTP/format errors).
  - `ai/aiCoach.ts` — structured snapshot (period facts, plan, curriculum statuses), prompt builder (never contains key/Authorization), layered JSON parse, output validation (rejects claims of record mutation/auto-promotion), fallback layers.
  - `ai/musicAi.ts` — deterministic practice-variation generation + playability/voice-leading validation [HEURISTIC].
  - `hooks/useAiCoach.ts` — settings + test connection + request coach.
  - Settings page AI card (enable/endpoint/model/key masked/test); Analytics page AI coach card (weekly review).
- Tests: regression 89 → 93 (settings sanitize + safe export, coach prompt/layers/validation/fallback, music-AI validation, wiring + no hardcoded key).
- Verification: typecheck 0, build 0, regression 93/93, diff --check 0.
- Pending: real provider integration (HUMAN QA), AI suggestions quality (HUMAN QA), DeepSeek/OpenAI live test (HUMAN QA).
- Commit: `stage7 ai coach` (next).

## Stage 8 — productization / Release Candidate

- Goal: unified backup/restore, first-run onboarding, About/licenses, RC versioning, Windows packaging.
- Implementation:
  - `storage/backup.ts` — unified backup (schemaVersion/appVersion/createdAt), key-safe export (AI key excluded, apiKeyExported flag), structural validation, non-destructive restore.
  - `storage/firstRun.ts` + `components/FirstRunWelcome.tsx` — 4-step first-launch flow.
  - `appInfo.ts` — APP_VERSION 1.0.0-rc.1 + licenses (VexFlow MIT, Bravura OFL 1.1, React MIT, Electron MIT, Salamander CC BY 3.0).
  - Settings page: organized Theme / Audio / AI / Data (backup+restore) / About cards.
  - package.json version → 1.0.0-rc.1; `npm run pack` builds `release/win-unpacked/钢琴基本功训练器.exe`.
- Tests: regression 93 → 96 (backup build/validate/restore/key-safe, first-run flag, app info, RC wiring).
- Verification: typecheck 0, build 0, regression 96/96, diff --check 0, `npm run pack` exit 0.
- Pending: NSIS installer final QA, theme 2.0 custom wallpapers (deferred, HUMAN QA), full plan 2.0 UI, Hanon/Czerny structured scores (CONTENT PARTIAL), Salamander samples (CONTENT PARTIAL), FP-30X hardware QA.
- Commit: `checkpoint: stage8 release candidate` (next).
