#!/usr/bin/env python3
"""Generate the raster app icons and social card from The Land's visual system."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ICONS = PUBLIC / "icons"

PAPER = "#202721"
MOON = "#d8c889"
WATER = "#78919a"
LAND = "#7c8865"
LAND_LIGHT = "#9a9d78"
ROAD = "#c8b780"
FOAM = "#b7c4bd"
CITY = "#e0bf73"
INK = "#efe8d6"


def font(size: int, mono: bool = False):
    name = "DejaVuSansMono.ttf" if mono else "DejaVuSerif.ttf"
    path = Path("/usr/share/fonts/truetype/dejavu") / name
    return ImageFont.truetype(str(path), size)


def icon(size: int) -> Image.Image:
    scale = size / 512
    point = lambda pair: tuple(round(value * scale) for value in pair)
    width = lambda value: max(1, round(value * scale))

    image = Image.new("RGB", (size, size), PAPER)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=round(104 * scale), fill=PAPER)
    draw.ellipse((*point((320, 90)), *point((416, 186))), fill=MOON)
    draw.rectangle((*point((64, 248)), *point((448, 408))), fill=WATER)
    draw.polygon([point(p) for p in ((40, 320), (208, 200), (480, 336), (328, 456), (104, 456))], fill=LAND)
    draw.polygon([point(p) for p in ((88, 320), (208, 240), (424, 344), (320, 416), (136, 416))], fill=LAND_LIGHT)
    draw.line([point(p) for p in ((176, 272), (240, 304), (168, 360))], fill=ROAD, width=width(16), joint="curve")
    draw.line([point(p) for p in ((64, 400), (140, 386), (248, 400), (344, 391), (448, 384))], fill=FOAM, width=width(10))
    draw.ellipse((*point((256, 304)), *point((288, 336))), fill=CITY)
    draw.line([point((272, 288)), point((272, 248))], fill=INK, width=width(12))
    draw.line([point((248, 272)), point((296, 272))], fill=INK, width=width(12))
    return image


def social_card() -> Image.Image:
    width, height = 1200, 630
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    for y in range(height):
        t = y / (height - 1)
        if y < 316:
            top, bottom = (23, 32, 29), (51, 66, 63)
            local = y / 316
        else:
            top, bottom = (83, 109, 116), (38, 61, 67)
            local = (y - 316) / 314
        color = tuple(round(a + (b - a) * local) for a, b in zip(top, bottom))
        for x in range(width):
            pixels[x, y] = color

    draw = ImageDraw.Draw(image)
    draw.ellipse((958, 66, 1062, 170), fill="#d9c98e")
    for x, y, radius in ((712, 82, 2), (778, 145, 2), (860, 69, 2), (918, 184, 2), (1081, 218, 2), (1136, 78, 2)):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill="#89928a")

    draw.polygon([(565, 325), (800, 190), (1174, 382), (925, 569), (488, 476)], fill="#748163")
    draw.polygon([(614, 329), (803, 223), (1109, 380), (914, 523), (560, 452)], fill="#929873")
    draw.line([(757, 252), (785, 296), (807, 338), (856, 371), (916, 459)], fill="#5f7c82", width=13, joint="curve")
    draw.line([(584, 390), (700, 374), (805, 407), (920, 386), (1194, 386)], fill="#7f9b9a", width=5)
    draw.line([(516, 456), (650, 447), (763, 462), (890, 451), (1030, 459)], fill="#78918f", width=5)

    for x, y, radius in ((703, 364, 7), (875, 310, 6), (959, 410, 7)):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill="#d8bd74")
        draw.line((x, y - radius - 6, x, y - radius - 28), fill="#ddd4b8", width=4)
        draw.line((x - 10, y - radius - 18, x + 10, y - radius - 18), fill="#ddd4b8", width=4)

    draw.line((942, 568, 1010, 431), fill="#8c8b69", width=42)
    draw.text((82, 70), "The Land", fill=INK, font=font(88))
    draw.text((88, 188), "A LIVING WORLD FOR YOUR SECOND SCREEN", fill="#d6d2c0", font=font(18, mono=True))
    draw.text((88, 503), "There is nothing to win. Only a world to watch.", fill="#c8c6b7", font=font(26))
    draw.text((88, 558), "THELAND.WORLD", fill="#8d9185", font=font(15, mono=True))
    return image


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    for size, name in ((192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")):
        icon(size).save(ICONS / name, optimize=True)
    social_card().save(PUBLIC / "social-card.png", optimize=True)
    print("Generated app icons and social-card.png")


if __name__ == "__main__":
    main()
