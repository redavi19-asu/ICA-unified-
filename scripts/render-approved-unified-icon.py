#!/usr/bin/env python3
"""Build ICA Unified desktop, mobile, web and favicon art from the approved two-desk image.
The checked-in source chunks are losslessly reassembled before any raster conversion.
"""
from __future__ import annotations

import base64
import hashlib
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PARTS = ROOT / "branding" / "source"
EXPECTED_SHA256 = "360b440d9eb1c7499ae210cb9cad752c9414b6da0bd31b365766563576cb4d4f"
source = b"".join((PARTS / f"unified-approved.part{index:02d}").read_bytes() for index in range(1, 6))
actual_hash = hashlib.sha256(source).hexdigest()
if actual_hash != EXPECTED_SHA256:
    raise SystemExit(f"ICA Unified icon source integrity check failed: {actual_hash}")

original = Image.open(BytesIO(source))
original.load()
if original.size != (256, 256):
    raise SystemExit(f"Unexpected approved source dimensions: {original.size}")

# Browser displays use the original WebP bytes, and the historical SVG path
# remains valid for existing web pages and launch screens.
webp_target = ROOT / "public" / "ica-unified-icon.webp"
webp_target.write_bytes(source)
encoded_webp = base64.b64encode(source).decode("ascii")
svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" '
    'role="img" aria-label="ICA Unified: blue LMS and orange AMS desks connected by a unifying ribbon">'
    f'<image width="512" height="512" href="data:image/webp;base64,{encoded_webp}"/>'
    '</svg>\n'
)
(ROOT / "public" / "ica-unified-icon.svg").write_text(svg, encoding="utf-8")
(ROOT / "desktop" / "app-icon.svg").write_text(svg, encoding="utf-8")

icon_1024 = original.convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS)
for target in (
    ROOT / "public" / "ica-unified-icon.png",
    ROOT / "mobile" / "assets" / "icon.png",
    ROOT / "desktop" / "app-icon.png",
):
    target.parent.mkdir(parents=True, exist_ok=True)
    icon_1024.save(target, format="PNG", optimize=True)

print("Validated artwork, and generated Unified web, macOS/Windows and iOS/Android icon assets.")
