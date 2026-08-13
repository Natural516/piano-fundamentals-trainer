# STAGE_LOG

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
