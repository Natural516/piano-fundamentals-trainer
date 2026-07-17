from pathlib import Path

from PIL import Image, ImageDraw


SIZE = 256
OUTPUT = Path(__file__).resolve().parents[1] / "build" / "icon.ico"


def create_icon() -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((10, 10, 246, 246), radius=48, fill="#0B1224", outline="#6172D9", width=7)
    draw.rounded_rectangle((35, 42, 221, 214), radius=24, fill="#111B35", outline="#344774", width=4)

    for x in (72, 128, 184):
        draw.ellipse((x - 8, 65, x + 8, 81), fill="#6D7CFF")

    keyboard_box = (48, 104, 208, 196)
    draw.rounded_rectangle(keyboard_box, radius=10, fill="#E8ECF8", outline="#B7C0D8", width=3)

    white_key_width = 160 / 7
    for index in range(1, 7):
        x = round(48 + white_key_width * index)
        draw.line((x, 106, x, 194), fill="#65708A", width=3)

    for boundary in (1, 2, 4, 5, 6):
        center_x = round(48 + white_key_width * boundary)
        draw.rounded_rectangle((center_x - 7, 106, center_x + 7, 161), radius=3, fill="#10182B")

    return image


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    icon = create_icon()
    icon.save(
        OUTPUT,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
