#!/usr/bin/env python3
"""Generates the YouTube Debloat icon SVGs: a play triangle with a clean diagonal cut."""
import math, sys, os

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")

def clip(poly, n, d):
    """Sutherland–Hodgman: keep points with n·p >= d."""
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

def pieces(tri, center, angle_deg, gap):
    a = math.radians(angle_deg)
    # cut line direction (cos, sin); normal perpendicular to it
    n = (-math.sin(a), math.cos(a))
    d0 = n[0]*center[0] + n[1]*center[1]
    upper = clip(tri, (-n[0], -n[1]), -(d0 - gap/2))   # n·p <= d0 - gap/2
    lower = clip(tri, n, d0 + gap/2)                   # n·p >= d0 + gap/2
    return upper, lower

def path(poly):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in poly) + " Z"

def glyph(scale, cx, cy, color, stroke, gap, angle=52):
    # triangle sized relative to scale (1 = 1024 canvas)
    h = 430 * scale
    w = 372 * scale
    tri = [(cx - w*0.42, cy - h/2), (cx - w*0.42, cy + h/2), (cx + w*0.58, cy)]
    up, lo = pieces(tri, (cx - w*0.087, cy), angle, gap*scale + stroke*scale)  # cut through the centroid
    s = stroke*scale
    attrs = f'fill="{color}" stroke="{color}" stroke-width="{s:.1f}" stroke-linejoin="round"'
    return f'<path d="{path(up)}" {attrs}/>\n<path d="{path(lo)}" {attrs}/>'

def app_icon(inset, radius):
    size = 1024 - 2*inset
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#ff3b4b"/>
<stop offset="1" stop-color="#e30022"/>
</linearGradient>
</defs>
<rect x="{inset}" y="{inset}" width="{size}" height="{size}" rx="{radius}" fill="url(#g)"/>
{glyph(size/1024, 512, 512, "#ffffff", 24, 52)}
</svg>
'''

def toolbar():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
{glyph(1.9, 512, 512, "#000000", 30, 110)}
</svg>
'''

os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, "icon.svg"), "w").write(app_icon(100, 186))        # macOS app icon grid
open(os.path.join(OUT, "icon-extension.svg"), "w").write(app_icon(0, 226)) # full-bleed for the extension
open(os.path.join(OUT, "icon-toolbar.svg"), "w").write(toolbar())          # monochrome template glyph
print("ok")
