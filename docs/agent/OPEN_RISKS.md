# OPEN_RISKS

## P0
- None known after automated validation.

## P1
- None known after automated validation.

## P2
- Chord block window (150ms) relies on system timers; hardware timing should confirm.
- Practice hooks mirror metronome state via render-time refs; same-frame events may see a ~16ms-stale state (within tolerance).

## P3
- Report modal visual layout not yet human-verified.
- No automated browser smoke test in this session (browser tool unavailable).
