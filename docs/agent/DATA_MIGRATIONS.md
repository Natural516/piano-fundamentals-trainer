# DATA_MIGRATIONS

| Schema | Current version | Migration rule |
| --- | --- | --- |
| practice records | schemaVersion 1 | keep; dedupe by session id; corrupt → safe empty |
| sight-reading settings | sight-reading-settings.v4 | v4 defaults: staffMode grand, noteCount 1, questionCount 50, keySignature C, notePoolMode diatonic, noteNameVisible true; old range/timeLimit dropped |
| display preferences | version 2 | per-module showVirtualKeyboard |
| theme storage | string enum | invalid → dark |
| training plan | training-plan.v1 | corrupt/unknown → safe default; stage data preserved |
| curriculum progress | curriculum-progress.v1 | corrupt/unknown → empty; per-exercise sanitize; attempts recorded |
| practice records | schemaVersion 1 | added module `free-practice` (same schema) |
| score practice segments | score-practice-segments.v1 | corrupt/unknown → empty; sanitize per segment |

Future migrations (stage 2+): curriculum progress, repertoire, score index, plan 2.0, backup format — must add a row here with schemaVersion before rollout.
