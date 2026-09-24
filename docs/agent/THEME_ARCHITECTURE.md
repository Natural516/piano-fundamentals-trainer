# Android Theme Architecture

## 1. Product layer and theme layer

The product layer owns what the application does: page information architecture, routes, real practice and history data, MIDI status, empty states, controls, and interaction behavior. Home, Practice, Tools, History, and Settings remain product components.

The theme layer owns how those product surfaces look: semantic colors, typography treatment, backgrounds, Hero artwork, paper and sticker treatments, shadows, textures, and decorative composition. A theme cannot add, remove, or reinterpret product facts or actions.

## 2. Peer themes

`light`, `dark`, and the development-only `bocchi-dev` theme are peer `ThemeDefinition` entries. Bocchi is not a Light subclass and does not depend on Light selectors or Light assets. Shared product styles form the base; each theme supplies a complete semantic token set and optional visual capabilities.

## 3. Registry and resolver

`prototype/android-tablet-v1/src/theme/themeRegistry.ts` is the current runtime registry. A definition contains:

- stable `id` and display name;
- source (`built-in`, `development`, or future `external`);
- preferred color scheme;
- a complete semantic token map;
- optional page-visual capabilities.

Product components receive the resolved active definition. They ask for capabilities such as `homeVisual`, `practiceVisual`, `toolsVisual`, `historyVisual`, `settingsVisual`, or `practiceActiveVisual`; they do not branch on `light`, `dark`, or `bocchi-dev` names.

## 4. Semantic tokens

The registry supplies the shared shell tokens, including application and surface colors, primary/secondary/muted text, accent colors, borders/dividers, shadows, navigation states, and primary-button colors. Existing legacy variable names remain as CSS aliases during the intentionally small migration.

Tokens cover shared UI foundations. They do not attempt to express every strong-theme illustration or composition as a color variable.

Practice feedback shares the semantic token names `--practice-feedback-success`, `--practice-feedback-danger`, and `--practice-feedback-warning`. Light and Dark intentionally use the same standard values; every `ThemeDefinition`, including `bocchi-dev` and future themes, owns its token values independently and may provide a theme-specific palette without changing Product-layer feedback semantics.

## 5. Strong-theme assets

A strong theme may register optional page-specific assets and a compatible rendering capability. The current `single-image-hero` Home capability supplies one composed Hero, a decorative headline, and card illustrations. The Home product still owns all real copy, data, routes, button semantics, and MIDI/history state.

The shared History dashboard is a Product-layer surface: summary facts, local-day aggregation, ranges, filters, trend geometry, record rows, and empty/error states remain available under every theme. `historyVisual` may provide only Hero and collage artwork plus a scoped frame class; it cannot provide values or redefine metrics.

Settings follows the same boundary. MIDI state and navigation, the theme-selection state, installed package metadata, QA update isolation, the production Update route, and open-source information remain Product-layer facts. `settingsVisual` may provide one Hero and decorative artwork for the Device, Theme, and About cards, but it cannot provide status, version, or action semantics.

ACTIVE practice follows the same one-screen rule. `practiceActiveVisual` may select a standard focus surface or a decorated focus skin and supply inert corner artwork. Question generation, notation geometry, VexFlow, MIDI, timing, judgement, counters, persistence, and navigation remain Product-layer responsibilities shared by every theme.

Theme-specific selectors must be scoped to the active theme. Bocchi Home rules therefore require `data-theme="bocchi-dev"`; Light and Dark do not render or inherit Bocchi Home artwork.

## 6. Single visual source

When an approved image already contains the correct characters, paper, instruments, background, decoration, and occlusion, that image is the only visual source for that region. Dynamic HTML may overlay transparent real content, but the implementation must not recreate the paper, extract characters, duplicate the Hero, or add compensating masks and clipped foreground copies.

The approved Bocchi Home continues to use exactly one `home-hero.png` layer.

## 7. Future external-theme compatibility

Future external packages should be validated and converted into the same runtime `ThemeDefinition` representation before activation. Product pages should continue to consume semantic tokens and declared capabilities, so registering a compatible theme does not require changes to the business structure of Home, Practice, Tools, History, or Settings.

The `external` source value is reserved only as an architectural boundary in this phase.

## 8. Explicit non-goals for this phase

This phase does not implement `.pttheme`, file picking, ZIP handling, a manifest parser, package validation, encryption, external-theme persistence, import/deletion UI, or a hidden theme entry. It also does not design an Original theme.

`bocchi-dev` is activated only in development/QA. Development and QA Settings may expose it as a registry-backed preview choice; ordinary production Settings remains limited to the built-in Light and Dark choices.

## 9. Product features must exist across themes

Future product features such as a practice trend chart, Tools search, statistics, filters, or new real states belong to the product layer. If a feature is added, it must exist under Light, Dark, Original, Bocchi, and compatible external themes. Themes may change its presentation but cannot make the feature theme-exclusive.

## 10. Themes cannot alter business logic

Theme selection must not change MIDI parsing or deduplication, Sight or Chord judgement, practice timing, persistence/history schemas, updater trust, signing, package identity, routing behavior, or real data. Theme changes are presentation changes only.
