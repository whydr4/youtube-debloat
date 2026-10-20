#!/usr/bin/env python3
"""Generates the YouTube Debloat icon SVGs: a red play button with a crack, patched with a band-aid.

Two colourways share one geometry — `light` (white tile) and `dark` (near-black tile) — plus a
monochrome template glyph for Safari's toolbar. Rasterise with scripts/make-icons.swift.
"""
import os, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")

RED = "#ff0033"
THEMES = {
    "light": dict(tile="#ffffff", edge="#e5e5ea", crack="#ffffff"),
    "dark": dict(tile="#111111", edge="#2a2a2e", crack="#111111"),
}


def head():
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">\n'


def tile(inset, radius, fill, edge):
    size = 1024 - 2 * inset
    return f'<rect x="{inset}" y="{inset}" width="{size}" height="{size}" rx="{radius}" fill="{fill}" stroke="{edge}" stroke-width="4"/>\n'


def triangle(fill, scale=1.0, cx=512, cy=512, w=372, h=430, sw=24):
    w, h, sw = w * scale, h * scale, sw * scale
    d = f"M{cx - w*0.42:.0f} {cy - h/2:.0f} L{cx - w*0.42:.0f} {cy + h/2:.0f} L{cx + w*0.58:.0f} {cy} Z"
    return f'<path d="{d}" fill="{fill}" stroke="{fill}" stroke-width="{sw:.0f}" stroke-linejoin="round"/>\n'


def crack(color, scale=1.0, sw=22):
    pts = [(470, 350), (520, 430), (480, 500), (540, 580), (500, 660)]
    pts = [(512 + (x - 512) * scale, 512 + (y - 512) * scale) for x, y in pts]
    d = "M" + " L".join(f"{x:.0f} {y:.0f}" for x, y in pts)
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw*scale:.0f}" stroke-linecap="round" stroke-linejoin="round"/>\n'


def bandaid(scale=1.0, cx=505, cy=512, angle=-38, L=380, W=100, shadow=True,
            tape="#f2c9a0", pad="#e9b98b", dots="#d9a070"):
    L, W = L * scale, W * scale
    cx, cy = 512 + (cx - 512) * scale, 512 + (cy - 512) * scale
    s = ""
    if shadow:
        s += f'<rect x="{cx - L/2 + 6*scale:.0f}" y="{cy - W/2 + 12*scale:.0f}" width="{L:.0f}" height="{W:.0f}" rx="{W/2:.0f}" fill="#000" opacity=".18"/>\n'
    s += f'<rect x="{cx - L/2:.0f}" y="{cy - W/2:.0f}" width="{L:.0f}" height="{W:.0f}" rx="{W/2:.0f}" fill="{tape}"/>\n'
    pw = L / 3
    s += f'<rect x="{cx - pw/2:.0f}" y="{cy - W/2:.0f}" width="{pw:.0f}" height="{W:.0f}" fill="{pad}"/>\n'
    r = W * 0.07
    for dx, dy in [(-22, -20), (22, -20), (0, 0), (-22, 20), (22, 20)]:
        s += f'<circle cx="{cx + dx*W/100:.0f}" cy="{cy + dy*W/100:.0f}" r="{r:.0f}" fill="{dots}"/>\n'
    return f'<g transform="rotate({angle} {cx:.0f} {cy:.0f})">\n{s}</g>\n'


def app_icon(theme, inset, radius):
    t = THEMES[theme]
    scale = (1024 - 2 * inset) / 1024
    return head() + tile(inset, radius, t["tile"], t["edge"]) + triangle(RED, scale) + crack(t["crack"], scale) + bandaid(scale) + "</svg>\n"


def toolbar():
    """Monochrome template glyph: a play triangle with a clean diagonal cut.
    The band-aid does not survive 16px, so the toolbar keeps the simpler mark."""
    import math

    def clip(poly, n, d):
        out = []
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            fa, fb = n[0]*a[0] + n[1]*a[1] - d, n[0]*b[0] + n[1]*b[1] - d
            if fa >= 0:
                out.append(a)
            if (fa >= 0) != (fb >= 0):
                t = fa / (fa - fb)
                out.append((a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t))
        return out

    w, h, cx, cy = 660, 760, 512, 512
    tri = [(cx - w*0.42, cy - h/2), (cx - w*0.42, cy + h/2), (cx + w*0.58, cy)]
    a = math.radians(52)
    n = (-math.sin(a), math.cos(a))
    d0 = n[0]*(cx - w*0.087) + n[1]*cy
    upper = clip(tri, (-n[0], -n[1]), -(d0 - 75))
    lower = clip(tri, n, d0 + 75)
    path = lambda poly: "M" + " L".join(f"{x:.0f} {y:.0f}" for x, y in poly) + " Z"
    attrs = 'fill="#000" stroke="#000" stroke-width="36" stroke-linejoin="round"'
    return head() + f'<path d="{path(upper)}" {attrs}/>\n<path d="{path(lower)}" {attrs}/>\n</svg>\n'


os.makedirs(OUT, exist_ok=True)
for theme in THEMES:
    open(os.path.join(OUT, f"icon-{theme}.svg"), "w").write(app_icon(theme, 100, 186))           # macOS app icon grid
    open(os.path.join(OUT, f"icon-extension-{theme}.svg"), "w").write(app_icon(theme, 0, 226))   # full-bleed, extension
open(os.path.join(OUT, "icon-toolbar.svg"), "w").write(toolbar())
for stale in ("icon.svg", "icon-extension.svg"):
    try:
        os.remove(os.path.join(OUT, stale))
    except FileNotFoundError:
        pass
print("ok")
