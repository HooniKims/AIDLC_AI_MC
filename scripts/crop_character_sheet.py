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

POSE_NAMES = {
    "pose-idle",
    "pose-wave",
    "pose-listen",
    "pose-explain",
    "pose-delight",
    "pose-think",
}


def largest_alpha_bbox(image: Image.Image, threshold: int = 12) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    width, height = image.size
    visited = bytearray(width * height)
    largest: tuple[int, int, int, int, int] | None = None

    for start_y in range(height):
        for start_x in range(width):
            index = start_y * width + start_x
            if visited[index] or pixels[start_x, start_y] <= threshold:
                continue

            stack = [(start_x, start_y)]
            visited[index] = 1
            count = 0
            left = right = start_x
            upper = lower = start_y

            while stack:
                x, y = stack.pop()
                count += 1
                left = min(left, x)
                right = max(right, x)
                upper = min(upper, y)
                lower = max(lower, y)

                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue

                    next_index = ny * width + nx
                    if visited[next_index] or pixels[nx, ny] <= threshold:
                        continue

                    visited[next_index] = 1
                    stack.append((nx, ny))

            if largest is None or count > largest[0]:
                largest = (count, left, upper, right + 1, lower + 1)

    if largest is None:
        return None

    return largest[1:]


def trim_alpha(image: Image.Image, padding: int = 12, largest_component: bool = False) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = largest_alpha_bbox(image) if largest_component else alpha.getbbox()
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
        trimmed = trim_alpha(crop, largest_component=name in POSE_NAMES)
        output = OUT_DIR / f"{name}.png"
        trimmed.save(output)
        print(f"{output.relative_to(ROOT)} {trimmed.width}x{trimmed.height}")


if __name__ == "__main__":
    main()
