# PROJECT_STATE

> **Legacy Windows/Electron document.** This file records the earlier desktop
> product and is not the Android tablet project's current state or roadmap. For
> the current Android source of truth, use `ANDROID_PROJECT_STATE.md`.

Updated: 2026-08-13

## Current stage

Stage 8 complete — Release Candidate ready for concentrated human/hardware QA.

## Completed stages

- Phase 0 (before c717616): UI + interaction optimization.
- Stage 0: MIDI per-event layer, scale time-axis core, chord feedback extraction, sight-reading report cleanup, unified report back action, regression 55/55.
- Stage 1: PianoSampler engine, SFZ loader, audio mode + piano volume, settings UI; regression 60/60.
- Stage 2: free practice + MIDI recording/playback, curriculum catalog (Hanon/Czerny frameworks, scale/coordination inheritance), progress storage; regression 65/65.
- Stage 3: chord V2 model (identity/inversion/voicing/texture/harmony), layered judgment, symbol parser, V2 practice page + mini keyboard; regression 71/71.
- Stage 4: progression model + 4536251 + 4 common progressions, arrangement variations, progression practice panel; regression 75/75.
- Stage 5: MusicXML/MXL subset parser, score timeline, Wait-mode engine, practice segments, ScorePracticePage; regression 84/84.
- Stage 6: Realtime + Follow cores, plan 2.0 migration, period analytics + AnalyticsPage; regression 89/89.
- Stage 7: AI provider abstraction, key-safe settings, layered coach output, validated music-AI variations; regression 93/93.
- Stage 8: unified backup/restore (key-safe), first-run onboarding, About/licenses, version 1.0.0-rc.1, Windows unpacked packaging; regression 96/96.

## Recent checkpoint

`c717616` checkpoint: complete first UI and interaction optimization (HEAD before stage 0).
`5bf63b4` stage0 · `b3c9356` stage1 · `4cedebd` stage2 · `373cf2e` stage3 · `110cc78` stage4 · `ea40342` stage5 · `2beba8d` stage6 · `5ca8172` stage7.
Next checkpoint: `checkpoint: stage8 release candidate`.

## Key architecture

- MIDI: Web MIDI callback → `midiMessages.parseMidiMessage` → `midiEventBus.publishMidiEvent` (synchronous per-event dispatch) → practice hooks subscribe via `useMidiEventSubscription`. React state (`recentEvents`/`latestEvent`/`activeNotes`) is display-only.
- Practice: `usePracticeEngine` (rhythm/judgement-test), `ScalePracticeCore` (pure), `useChordPractice` + `chordFeedback` pure functions, `useSightReadingPractice` + `SightReadingSessionCore`, `useCoordinationPractice`.
- Reports: `PracticeReportModal` shared back/repeat actions; sight-reading report cleaned.
- Audio: `PianoSampler` (Web Audio) — sample anchors + synthesized fallback, polyphony/stealing, CC64 sustain; audio mode builtin/silent/external; independent piano volume.
- Curriculum: `curriculum/` catalog + progress v1; free practice recording/playback in `midi/midiRecording.ts` + `hooks/useFreePractice.ts`.
- Chord V2: `chordV2/` identity/voicing/harmony pure modules; layered judgment; `ChordV2Page` + `MiniKeyboard`.
- Harmony: `harmony/` progression definitions + builder + arrangement variation + playability; `ProgressionPracticePanel`.
- Score: `score/` XML mini parser, MusicXML subset parser, ZIP/MXL reader, timeline, WaitScoreCore, practice segments; `ScorePracticePage`.
- Realtime/Follow: `score/realtimeScoreCore.ts` + `followScoreCore.ts`; unified `useScorePractice(score, mode)`.
- Plan: `plan/planV2.ts` (migration from v1 preserved).
- Analytics: `analytics/periodStats.ts` + `AnalyticsPage`.
- AI: `ai/` provider + settings (key-safe export) + coach (facts/interpretation/recommendation) + music-AI validation.
- Storage: `storage/backup.ts` unified backup/restore (key-safe), `storage/firstRun.ts` onboarding flag.

## Main entry points

- `src/renderer/src/App.tsx` — routing + MIDI wiring.
- `src/renderer/src/midi/` — event bus + message parser.
- `src/renderer/src/hooks/` — practice hooks + subscription helper.
- `src/renderer/src/audio/` — piano sampler, SFZ loader, voice policy, audio settings.
- `src/renderer/src/utils/scalePracticeCore.ts`, `utils/chordFeedback.ts` — pure judgment cores.

## Current test commands

- `npm run typecheck`
- `npm run build`
- `npm run test:regression` (96 tests)
- `git diff --check`

## Current P0/P1

- P0 MIDI multi-event loss: fixed via per-event bus (verified by tests).
- P1 scale 8/8 missed cascade: fixed via ScalePracticeCore window matching (verified by tests).
- P2: sample pack assets missing (CONTENT PARTIAL); audio listening/latency pending hardware QA.
- P2: curriculum practice mode not yet built (catalog + engine ready); old scale/coordination entries kept until curriculum path is hardware-validated.
- No known P0 after automated validation; hardware QA pending.

## Hardware / human QA pending

- Roland FP-30X: simultaneous chords, rapid scale, repeated notes, CC64, reconnect, 60 BPM scale.
- Audio quality / latency, musicality of voicings, UI visual quality.
