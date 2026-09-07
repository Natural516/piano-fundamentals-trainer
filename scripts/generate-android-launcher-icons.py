from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "artwork" / "approved" / "android-app-icon-source.png"
EXPECTED_SHA256 = "4BC8EA53852A16F2B5704CF7C5FC03A85C0F4A7287A15AC6E0A787D21817BBD1"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
PREVIEW = ROOT / "android" / "app" / "build" / "outputs" / "post-v1" / "1.4.0" / "icon-previews"
DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def fit_approved_source(source: Image.Image, size: int, scale: float = 0.74) -> Image.Image:
    """Scale the complete approved bitmap; never crop or alter its pixels creatively."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    artwork_size = max(1, round(size * scale))
    artwork = source.resize((artwork_size, artwork_size), Image.Resampling.LANCZOS)
    offset = (size - artwork_size) // 2
    canvas.alpha_composite(artwork, (offset, offset))
    return canvas


def dark_background(size: int) -> Image.Image:
    return Image.new("RGBA", (size, size), (0, 0, 0, 255))


def masked(image: Image.Image, shape: str) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    bounds = (0, 0, image.width - 1, image.height - 1)
    if shape == "circle":
        draw.ellipse(bounds, fill=255)
    elif shape == "squircle":
        draw.rounded_rectangle(bounds, radius=round(image.width * 0.225), fill=255)
    else:
        draw.rectangle(bounds, fill=255)
    result = image.copy()
    result.putalpha(mask)
    return result


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Approved icon source is missing: {SOURCE}")
    observed_hash = sha256(SOURCE)
    if observed_hash != EXPECTED_SHA256:
        raise SystemExit(f"Approved icon hash mismatch: {observed_hash}")

    source = Image.open(SOURCE).convert("RGBA")
    for density, (legacy_size, foreground_size) in DENSITIES.items():
        directory = RES / f"mipmap-{density}"
        legacy = source.resize((legacy_size, legacy_size), Image.Resampling.LANCZOS)
        foreground = fit_approved_source(source, foreground_size)
        adaptive_composite = dark_background(legacy_size)
        adaptive_composite.alpha_composite(fit_approved_source(source, legacy_size))
        save_png(legacy, directory / "ic_launcher.png")
        save_png(masked(adaptive_composite, "circle"), directory / "ic_launcher_round.png")
        save_png(foreground, directory / "ic_launcher_foreground.png")

    preview_size = 512
    adaptive = dark_background(preview_size)
    adaptive.alpha_composite(fit_approved_source(source, preview_size))
    save_png(source.resize((preview_size, preview_size), Image.Resampling.LANCZOS), PREVIEW / "full-square.png")
    save_png(masked(adaptive, "circle"), PREVIEW / "circle.png")
    save_png(masked(adaptive, "squircle"), PREVIEW / "squircle.png")
    print(f"source={SOURCE}")
    print(f"sha256={observed_hash}")
    print(f"previews={PREVIEW}")


if __name__ == "__main__":
    main()
