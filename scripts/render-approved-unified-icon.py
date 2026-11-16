#!/usr/bin/env python3
"""Render ICA Unified app and site icons from the approved daylight artwork."""
from pathlib import Path
from io import BytesIO
import base64
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Daylight Global News LMS AMS Icon.png"
if not SOURCE.is_file():
    raise SystemExit(f"Missing approved daytime icon: {SOURCE}")
with Image.open(SOURCE) as input_image:
    original = input_image.convert("RGB")
    original.load()

icon_1024 = original.resize((1024, 1024), Image.Resampling.LANCZOS)
for target in (
    ROOT / "public" / "ica-unified-icon.png",
    ROOT / "mobile" / "assets" / "icon.png",
    ROOT / "desktop" / "app-icon.png",
):
    target.parent.mkdir(parents=True, exist_ok=True)
    icon_1024.save(target, format="PNG", optimize=True)

icon_1024.save(ROOT / "public" / "ica-unified-icon.webp", format="WEBP", quality=95)
buffer = BytesIO()
icon_1024.save(buffer, format="PNG", optimize=True)
b64 = base64.b64encode(buffer.getvalue()).decode("ascii")
svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" '
    'role="img" aria-label="ICA Unified daytime logo with LMS and AMS desks">'
    f'<image width="1024" height="1024" href="data:image/png;base64,{b64}"/>'
    '</svg>\n'
)
(ROOT / "public" / "ica-unified-icon.svg").write_text(svg, encoding="utf-8")
(ROOT / "desktop" / "app-icon.svg").write_text(svg, encoding="utf-8")
print("Updated all ICA Unified web, desktop and mobile artwork from approved daylight PNG.")
