# Bocchi Chord Query Tool Detail assets

The Chord Query screen uses one page-specific hero plus shared Tool Detail artwork:

- `ryo-reference-sticker.png` is A, the Chord Query-specific Ryo hero. Its incomplete lower character and bass boundary intentionally sits behind the real Query Panel surface; it is not a standalone or cross-page reusable character asset.
- `../shared/tool-detail-decoration-sheet.png` is B, a transparent scrapbook sheet exposed only through seven limited crop windows.
- `../shared/music-studio-background.png` is C, the blue-white music-studio environment plate shared by decorated Tool Detail pages.

All runtime artwork is inert (`aria-hidden` and `pointer-events: none`). The environment is softened by a CSS wash, while the character and decoration crops sit above the Product UI only in non-interactive visual layers.

D2 is the current strong-theme visual reference only. It remains outside this runtime asset tree and is not imported, used as a background, or cropped into Product UI. The older D reference is no longer used for this pass.

All query values, native selects, chord symbols, theoretical spellings, MIDI behavior, navigation, and result semantics remain Product-layer responsibilities.

Scale / Key Signature and Interval Query must not reuse A by default. Each future page requires page-appropriate artwork or a genuinely complete reusable character asset.
