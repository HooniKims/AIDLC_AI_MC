from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "characters" / "ai-mc-character-sheet.png"
OUT_DIR = ROOT / "assets" / "characters" / "generated"

REGIONS = {
    "pose-idle": (0, 0, 380, 445),
    "pose-wave": (380, 0, 775, 445),
    "pose-listen": (760, 0, 1145, 445),
    "pose-explain": (1120, 0, 1536, 445),
    "pose-delight": (250, 380, 670, 815),
    "pose-think": (760, 380, 1165, 815),
    "mouth-closed": (0, 735, 256, 1024),
    "mouth-small": (256, 735, 512, 1024),
    "mouth-wide": (512, 735, 768, 1024),
    "mouth-smile": (768, 735, 1024, 1024),
    "mouth-o": (1024, 735, 1280, 1024),
    "mouth-e": (1280, 735, 1536, 1024),
}


def trim_alpha(image: Image.Image, padding: int = 12) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return image

    left = max(bbox[0] - padding, 0)
    upper = max(bbox[1] - padding, 0)
    right = min(bbox[2] + padding, image.width)
    lower = min(bbox[3] + padding, image.height)
    return image.crop((left, upper, right, lower))


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SOURCE).convert("RGBA")

    for name, box in REGIONS.items():
        crop = sheet.crop(box)
        trimmed = trim_alpha(crop)
        output = OUT_DIR / f"{name}.png"
        trimmed.save(output)
        print(f"{output.relative_to(ROOT)} {trimmed.width}x{trimmed.height}")


if __name__ == "__main__":
    main()
