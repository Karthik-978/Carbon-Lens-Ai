import re
from pathlib import Path

import easyocr

reader = None


def _get_reader():
    global reader
    if reader is None:
        reader = easyocr.Reader(["en"], gpu=False)
    return reader


def extract_units_from_image(image_path):
    path = Path(image_path)
    if not path.exists():
        return None

    try:
        results = _get_reader().readtext(str(path), detail=0)
    except Exception:
        return None

    text_blocks = []
    for item in results:
        if isinstance(item, str):
            text_blocks.append(item)

    full_text = "\n".join(text_blocks).lower()

    patterns = [
        r"units?\s*[:=]\s*(\d+)",
        r"consumed\s*[:=]\s*(\d+)",
        r"unit\s*(\d+)",
        r"(\d+)\s*units?"
    ]

    for pattern in patterns:
        match = re.search(pattern, full_text)
        if match:
            return int(match.group(1))

    return None