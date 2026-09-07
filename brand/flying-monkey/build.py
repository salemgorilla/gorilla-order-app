#!/usr/bin/env python3
"""Flying Monkey — mascot mark, ephemera and proof sheet.

Everything here is drawn from one constraint set, held everywhere:

  * 24-unit grid on a 240 viewBox (1 grid unit = 10).
  * Every curve is a circular arc with a radius in R = {5, 10, 20, 30, 60}.
  * Every straight edge sits at 0°, 90°, or 42.52° — the latitude of Salem, MA.
  * Three flight feathers per wing — the Golden Cap's three commands (Baum, 1900).

Run:  python3 build.py <outdir>
"""
import math, sys, os

# ---------------------------------------------------------------- constants
R = {5, 10, 20, 30, 60}
LAT = 42.52                       # Salem, Massachusetts — 42.52° N
th = math.radians(LAT)
d = (math.cos(th), -math.sin(th))   # along the wing, up and out
n = (math.sin(th), math.cos(th))    # across the wing, down and out

INK   = "#111111"   # Winkie Black   — Pantone Black C
GOLD  = "#F1C400"   # Cap Gold       — Pantone 7406 C
BLANK = "#F4F1EA"   # Kansas         — the garment / paper blank, not an ink
RULE  = "#8E8674"
FAINT = "#D8D2C4"

def r(v):
    assert v in R, f"radius {v} is not in the constraint set {sorted(R)}"
    return v

def f(x):
    s = f"{x:.2f}".rstrip("0").rstrip(".")
    return "0" if s == "-0" else s

def pt(p):
    return f"{f(p[0])} {f(p[1])}"

def add(p, q, s=1.0):
    return (p[0] + q[0] * s, p[1] + q[1] * s)

# ---------------------------------------------------------------- the mark
WING_ROOT = (150, 98)
WING_W    = 14            # ink across one feather
WING_PITCH= 20            # 14 ink + 6 slit
WING_LEN  = (84, 84, 84)   # equal: each wing is a 7-segment '3' sheared to 42.52°
SHOULDER  = 30            # the slits stay closed for the first 3u

def wing_path():
    out = []
    for i, L in enumerate(WING_LEN):
        a = add(WING_ROOT, n, i * WING_PITCH)
        b = add(a, d, L); c = add(b, n, WING_W); e = add(a, n, WING_W)
        out.append(f"M{pt(a)} L{pt(b)} L{pt(c)} L{pt(e)} Z")
    a = WING_ROOT
    b = add(a, d, SHOULDER); span = 2 * WING_PITCH + WING_W
    c = add(b, n, span); e = add(a, n, span)
    out.append(f"M{pt(a)} L{pt(b)} L{pt(c)} L{pt(e)} Z")
    return " ".join(out)

TASSEL_A = (140, 36)
TASSEL_B = add(TASSEL_A, (math.cos(th), math.sin(th)), 24)

def mark(ink, gold, small=False, wings=True, tail=True):
    """ink: head, wings, tail.  gold: face plate, cap, inner ear.
    small=True is the under-4-inch cut: teeth close, tassel cord thickens."""
    s = []
    w = wing_path()
    if wings:
        s.append(f'<g id="wings" fill="{ink}"><path d="{w}"/>'
                 f'<path transform="translate(240 0) scale(-1 1)" d="{w}"/></g>')
    if tail:
        s.append(f'<path id="tail" fill="none" stroke="{ink}" stroke-width="8" stroke-linecap="butt" '
                 f'd="M92 170 V196 A{r(20)} {r(20)} 0 0 1 52 196 A{r(10)} {r(10)} 0 0 1 72 196"/>')
    s.append(f'<g id="head" fill="{ink}"><circle cx="60" cy="102" r="{r(20)}"/>'
             f'<circle cx="180" cy="102" r="{r(20)}"/><circle cx="120" cy="120" r="{r(60)}"/></g>')
    s.append(f'<g id="face" fill="{gold}">'
             f'<circle cx="58" cy="102" r="{r(10)}"/><circle cx="182" cy="102" r="{r(10)}"/>'
             f'<circle cx="100" cy="132" r="{r(30)}"/><circle cx="140" cy="132" r="{r(30)}"/>'
             f'<circle cx="106" cy="108" r="{r(20)}"/><circle cx="134" cy="108" r="{r(20)}"/>'
             f'<path d="M86 108 H154 V132 H86 Z"/><path d="M100 132 H140 V162 H100 Z"/></g>')
    eyes = []
    for cx in (106, 134):
        eyes.append(f'<circle fill="{ink}" cx="{cx}" cy="112" r="{r(10)}"/>'
                    f'<rect fill="{gold}" x="{cx-10}" y="102" width="20" height="7"/>')
    s.append('<g id="eyes">' + "".join(eyes) + '</g>')
    mouth = [f'<rect fill="{ink}" x="100" y="146" width="40" height="10"/>']
    if not small:
        mouth += [f'<rect fill="{gold}" x="{x}" y="146" width="4" height="5"/>' for x in (102, 110, 118, 126, 134)]
    s.append('<g id="mouth">' + "".join(mouth) + '</g>')
    cord = 4 if small else 3
    s.append(f'<g id="cap"><rect fill="{gold}" x="100" y="36" width="40" height="30"/>'
             f'<rect fill="{ink}" x="100" y="56" width="40" height="4"/>'
             f'<path fill="none" stroke="{ink}" stroke-width="{cord}" d="M{pt(TASSEL_A)} L{pt(TASSEL_B)}"/>'
             f'<circle fill="{ink}" cx="{f(TASSEL_B[0])}" cy="{f(TASSEL_B[1])}" r="{r(5)}"/></g>')
    return "\n".join(s)

def svg(body, vb="0 0 240 240", w=None, h=None, bg=None, title=None):
    size = f' width="{w}" height="{h}"' if w else ""
    t = f"<title>{title}</title>\n" if title else ""
    bgr = f'<rect width="100%" height="100%" fill="{bg}"/>\n' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{size}>\n{t}{bgr}{body}\n</svg>\n')

# ---------------------------------------------------------------- construction drawing
def construction():
    s = []
    # grid
    for i in range(0, 25):
        s.append(f'<path stroke="{FAINT}" stroke-width="0.4" d="M{i*10} 0 V240 M0 {i*10} H240"/>')
    hl = f'fill="none" stroke="{INK}" stroke-width="0.6"'
    # circles
    for cx, cy, rr in ((120,120,60),(60,102,20),(180,102,20),(58,102,10),(182,102,10),
                       (100,132,30),(140,132,30),(106,108,20),(134,108,20),(106,112,10),(134,112,10),
                       (72,196,20),(62,196,10),(TASSEL_B[0],TASSEL_B[1],5)):
        s.append(f'<circle {hl} cx="{f(cx)}" cy="{f(cy)}" r="{rr}"/>')
    # centre ticks
    for cx, cy in ((120,120),(60,102),(180,102),(100,132),(140,132),(106,108),(134,108),(72,196),(62,196)):
        s.append(f'<path stroke="{INK}" stroke-width="0.6" d="M{cx-2} {cy} H{cx+2} M{cx} {cy-2} V{cy+2}"/>')
    # wing outline
    w = wing_path()
    s.append(f'<path {hl} d="{w}"/><path {hl} transform="translate(240 0) scale(-1 1)" d="{w}"/>')
    # cap, mouth, tail centreline
    s.append(f'<path {hl} d="M100 36 H140 V66 H100 Z M100 56 H140 M100 46 H140 M100 146 H140 V156 H100 Z"/>')
    s.append(f'<path {hl} d="M92 170 V196 A20 20 0 0 1 52 196 A10 10 0 0 1 72 196"/>')
    s.append(f'<path {hl} d="M{pt(TASSEL_A)} L{pt(TASSEL_B)}"/>')
    # the angle callout on the right wing's leading edge
    a = WING_ROOT
    s.append(f'<path stroke="{INK}" stroke-width="0.6" stroke-dasharray="2 2" d="M{pt(a)} H{f(a[0]+60)}"/>')
    ang_end = add(a, d, 40)
    s.append(f'<path fill="none" stroke="{GOLD}" stroke-width="2" d="M{f(a[0]+40)} {f(a[1])} A40 40 0 0 0 {pt(ang_end)}"/>')
    s.append(f'<text x="{f(a[0]+44)}" y="{f(a[1]-8)}" font-family="JetBrains Mono, monospace" font-size="6" fill="{INK}">42.52°</text>')
    s.append(f'<text x="{f(a[0]+44)}" y="{f(a[1]-1)}" font-family="JetBrains Mono, monospace" font-size="4" fill="{INK}">SALEM MA · LAT</text>')
    # radius labels
    lab = lambda x, y, t: f'<text x="{x}" y="{y}" font-family="JetBrains Mono, monospace" font-size="5" fill="{INK}">{t}</text>'
    s.append(lab(120-6, 120+66, "R60"))
    s.append(lab(60-6, 102-23, "R20"))
    s.append(lab(100-7, 132+35, "R30"))
    s.append(lab(106-6, 108-24, "R20"))
    s.append(lab(134-3, 112+2, "R10"))
    s.append(lab(72-6, 196+25, "R20"))
    s.append(lab(TASSEL_B[0]+7, TASSEL_B[1]+2, "R5"))
    s.append(lab(126, 168, "WING = 7-SEG '3' SHEARED 42.52°"))
    s.append(lab(126, 174, "3 × 84 · 14 INK · 6 SLIT · 30 SPINE"))
    return "\n".join(s)


# ---------------------------------------------------------------- the segment alphabet
# One grammar for every letter: a 12 × 11 cell, stroke 2, edges at 0° / 90° only,
# and every diagonal at 42.52° — which is why the cell is wider than tall
# (atan(11/12) = 42.51°). Extended, like the WipEout register, for a reason you can
# state. K, Y, M, N, R, V, X and the prime marks carry the datum in their diagonals.
GW, GH, GS = 12, 11, 2
_A = {
 'A': (12, [[(1,11),(1,1),(11,1),(11,11)], [(1,6.5),(11,6.5)]]),
 'B': (12, [[(1,11),(1,1),(11,1),(11,10),(1,10)], [(1,5.5),(11,5.5)]]),
 'C': (12, [[(12,1),(1,1),(1,10),(12,10)]]),
 'D': (12, [[(1,0),(1,11)], [(1,1),(9,1),(11,2.83),(11,8.17),(9,10),(1,10)]]),
 'E': (12, [[(12,1),(1,1),(1,10),(12,10)], [(1,5.5),(9,5.5)]]),
 'F': (12, [[(12,1),(1,1),(1,11)], [(1,5.5),(9,5.5)]]),
 'G': (12, [[(12,1),(1,1),(1,10),(11,10),(11,5.5),(6,5.5)]]),
 'H': (12, [[(1,0),(1,11)], [(11,0),(11,11)], [(1,5.5),(11,5.5)]]),
 'I': (4,  [[(2,0),(2,11)]]),
 'K': (8,  [[(1,0),(1,11)], [(1,5.5),(7,0)], [(1,5.5),(7,11)]]),
 'L': (12, [[(1,0),(1,10),(12,10)]]),
 'M': (12, [[(1,11),(1,0)], [(1,0),(6,4.58)], [(11,0),(6,4.58)], [(11,0),(11,11)]]),
 'N': (12, [[(1,11),(1,0)], [(0,0),(12,11)], [(11,0),(11,11)]]),
 'O': (12, [[(1,1),(11,1),(11,10),(1,10),(1,1),(11,1)]]),
 'P': (12, [[(1,11),(1,1),(11,1),(11,5.5),(1,5.5)]]),
 'R': (12, [[(1,11),(1,1),(11,1),(11,5.5),(1,5.5)], [(5,5.5),(11,11)]]),
 'S': (12, [[(12,1),(1,1),(1,5.5),(11,5.5),(11,10),(0,10)]]),
 'T': (12, [[(0,1),(12,1)], [(6,0),(6,11)]]),
 'U': (12, [[(1,0),(1,10),(11,10),(11,0)]]),
 'V': (12, [[(1,0),(1,5.5)], [(11,0),(11,5.5)], [(0,5.5),(6,11)], [(12,5.5),(6,11)]]),
 'W': (12, [[(1,0),(1,10),(11,10),(11,0)], [(6,5.5),(6,10)]]),
 'X': (12, [[(0,0),(12,11)], [(12,0),(0,11)]]),
 'Y': (12, [[(0,0),(6,5.5)], [(12,0),(6,5.5)], [(6,5.5),(6,11)]]),
 'Z': (12, [[(0,1),(11,1)], [(11,0.9),(1,10.1)], [(1,10),(12,10)]]),
 '0': (12, [[(1,1),(11,1),(11,10),(1,10),(1,1),(11,1)]]),
 '1': (8,  [[(4,0),(4,11)], [(1,2.75),(4,0)]]),
 '2': (12, [[(0,1),(11,1),(11,5.5),(1,5.5),(1,10),(12,10)]]),
 '3': (12, [[(0,1),(11,1),(11,10),(0,10)], [(5,5.5),(11,5.5)]]),
 '4': (12, [[(1,0),(1,5.5),(12,5.5)], [(9,0),(9,11)]]),
 '5': (12, [[(12,1),(1,1),(1,5.5),(11,5.5),(11,10),(0,10)]]),
 '6': (12, [[(12,1),(1,1),(1,10),(11,10),(11,5.5),(1,5.5)]]),
 '7': (12, [[(0,1),(11,1),(11,11)]]),
 '8': (12, [[(1,1),(11,1),(11,10),(1,10),(1,1),(11,1)], [(1,5.5),(11,5.5)]]),
 '9': (12, [[(11,10),(11,1),(1,1),(1,5.5),(11,5.5)]]),
 '°': (6,  [[(1,1),(5,1),(5,5),(1,5),(1,1),(5,1)]]),
 '′': (5,  [[(0,3.67),(4,0)]]),
 '″': (9,  [[(0,3.67),(4,0)], [(4,3.67),(8,0)]]),
 '·': (4,  [[(1,5.5),(3,5.5)]]),
 '-': (8,  [[(0,5.5),(8,5.5)]]),
 '/': (12, [[(0,11),(12,0)]]),
 ' ': (6,  []),
}
_clip = [0]

def seg_text(text, x, y, size, fill, tracking=2):
    """Draw text in the segment alphabet. size = cap height in output units."""
    k = size / GH
    out, cx = [], 0.0
    for ch in text:
        w, strokes = _A.get(ch, _A[' '])
        if strokes:
            _clip[0] += 1; cid = f"sc{_clip[0]}"
            out.append(f'<clipPath id="{cid}"><rect x="{f(cx)}" y="0" width="{f(w)}" height="{GH}"/></clipPath>')
            paths = " ".join("M" + " L".join(pt(p) for p in st) for st in strokes)
            out.append(f'<g clip-path="url(#{cid})"><path transform="translate({f(cx)} 0)" fill="none" stroke="{fill}" '
                       f'stroke-width="{GS}" stroke-linejoin="miter" stroke-miterlimit="8" stroke-linecap="butt" d="{paths}"/></g>')
        cx += w + tracking
    width = (cx - tracking) * k
    g = f'<g transform="translate({f(x)} {f(y)}) scale({f(k)})">' + "".join(out) + '</g>'
    return g, width

def seg_width(text, size, tracking=2):
    k = size / GH
    return (sum(_A.get(c, _A[' '])[0] + tracking for c in text) - tracking) * k

def wordmark(x, y, size, fill, gap=None):
    """FLYING over MONKEY, flush left, in the segment alphabet."""
    gap = gap if gap is not None else size * 0.36
    a, wa = seg_text("FLYING", x, y, size, fill)
    b, wb = seg_text("MONKEY", x, y + size + gap, size, fill)
    return a + b, max(wa, wb), 2 * size + gap

READOUT = "42°31′12″N"   # 42.52° N — Salem's latitude as degrees, minutes, seconds

# ---------------------------------------------------------------- type helpers (for ephemera)
DISPLAY = "'Space Grotesk', 'Suisse Int\\'l', 'Neue Haas Grotesk', Helvetica, Arial, sans-serif"
MONO    = "'JetBrains Mono', 'ABC Diatype Mono', 'Berkeley Mono', monospace"

def T(x, y, txt, size, fill=INK, fam=MONO, weight=500, anchor="start", ls=0, extra=""):
    return (f'<text x="{f(x)}" y="{f(y)}" font-family="{fam}" font-weight="{weight}" font-size="{size}" '
            f'fill="{fill}" text-anchor="{anchor}" letter-spacing="{ls}" {extra}>{txt}</text>')

SLOGAN   = "THREE COMMANDS PER OWNER."
DISCLAIM = ["The Cap is held in-house.", "Requests for a fourth command", "are not acknowledged."]
PLACE    = "SALEM MA · 42.52°N 70.90°W"

# ---------------------------------------------------------------- ephemera
def hangtag():
    """2 × 3.5 in, one ink (Winkie Black) on Kansas card, 1/4in hole."""
    s = [f'<rect x="0.5" y="0.5" width="199" height="349" fill="{BLANK}" stroke="{INK}" stroke-width="1"/>',
         f'<circle cx="100" cy="22" r="{r(5)}" fill="none" stroke="{INK}" stroke-width="1"/>',
         f'<g transform="translate(40 40) scale(0.5)">{mark(INK, BLANK, small=True)}</g>',
         f'<path stroke="{INK}" stroke-width="1" d="M16 170 H184"/>',
         wordmark(16, 180, 20, INK)[0],
         seg_text("AIR SERVICES", 16, 230, 7, INK)[0],
         T(184, 237, "™", 7, anchor="end"),
         f'<path stroke="{INK}" stroke-width="1" d="M16 246 H184"/>',
         T(16, 258, "FM-AIR-26-FF-1C", 8, weight=700),
         T(184, 258, "COMMAND 01/03", 8, anchor="end"),
         T(16, 270, "CAP GOLD ON WINKIE BLACK", 6.5),
         T(184, 270, "156 MESH", 6.5, anchor="end"),
         f'<path stroke="{INK}" stroke-width="1" d="M16 280 H184"/>',
         T(16, 292, SLOGAN, 7, weight=700),
         ]
    y = 306
    for line in DISCLAIM:
        s.append(T(16, y, line, 6)); y += 8
    s.append(f'<path stroke="{INK}" stroke-width="1" d="M16 330 H184"/>')
    s.append(T(16, 340, PLACE, 5.5))
    s.append(T(184, 340, "47 CANAL ST", 5.5, anchor="end"))
    return svg("\n".join(s), vb="0 0 200 350", title="Flying Monkey — hangtag FM-CAP-26-TAG-1C")

def service_notice():
    """3 in round sticker, one ink (Cap Gold) on Winkie Black vinyl."""
    s = [f'<circle cx="150" cy="150" r="149" fill="{INK}"/>',
         f'<circle cx="150" cy="150" r="118" fill="none" stroke="{GOLD}" stroke-width="1"/>',
         f'<circle cx="150" cy="150" r="140" fill="none" stroke="{GOLD}" stroke-width="1"/>',
         '<defs><path id="ring" d="M150 150 m-129 0 a129 129 0 1 1 258 0 a129 129 0 1 1 -258 0"/></defs>',
         f'<text font-family="{MONO}" font-size="11" font-weight="700" fill="{GOLD}" letter-spacing="2.2">'
         f'<textPath href="#ring">FLYING MONKEY AIR SERVICES · SERVICE NOTICE · THREE COMMANDS PER OWNER · </textPath></text>',
         f'<g transform="translate(66 60) scale(0.7)">{mark(GOLD, INK, small=True)}</g>',
         T(150, 250, "FM-CAP-26-STK-1C", 8, fill=GOLD, anchor="middle", ls=0.5),
         ]
    return svg("\n".join(s), vb="0 0 300 300", title="Flying Monkey — service notice sticker")

def neck_label():
    """60 × 25 mm woven label. Cap Gold weft on Winkie Black ground."""
    s = [f'<rect width="240" height="100" fill="{INK}"/>',
         f'<rect x="4.5" y="4.5" width="231" height="91" fill="none" stroke="{GOLD}" stroke-width="1"/>',
         f'<g transform="translate(14 14) scale(0.3)">{mark(GOLD, INK, small=True)}</g>',
         wordmark(92, 22, 14, GOLD)[0],
         seg_text(READOUT + " · SALEM", 92, 70, 5.5, GOLD)[0],
         f'<path stroke="{GOLD}" stroke-width="1" d="M204 14 V86"/>',
         seg_text("L", 212, 38, 22, GOLD)[0],
         T(218, 70, "FM-AIR", 5.5, fill=GOLD, anchor="middle"),
         ]
    return svg("\n".join(s), vb="0 0 240 100", title="Flying Monkey — woven neck label")


def departure_board():
    """18 × 24 in poster. Cap Gold on Winkie Black. The Cap Office publishes the schedule."""
    W, H = 540, 720
    s = [f'<rect width="{W}" height="{H}" fill="{INK}"/>']
    x0 = 36
    s.append(wordmark(x0, 40, 44, GOLD)[0])
    s.append(f'<g transform="translate({W-36-120} 34) scale(0.5)">{mark(GOLD, INK, small=True)}</g>')
    y = 170
    s.append(f'<path stroke="{GOLD}" stroke-width="1" d="M{x0} {y} H{W-x0}"/>')
    s.append(seg_text("DEPARTURES", x0, y + 14, 12, GOLD)[0])
    s.append(seg_text("CAP OFFICE · SALEM", W - 36 - seg_width("CAP OFFICE · SALEM", 8), y + 18, 8, GOLD)[0])
    y += 44
    s.append(f'<path stroke="{GOLD}" stroke-width="1" d="M{x0} {y} H{W-x0}"/>')
    cols = (x0, x0 + 60, W - 36)
    s.append(seg_text("CMD", cols[0], y + 12, 7, GOLD)[0])
    s.append(seg_text("UNIT", cols[1], y + 12, 7, GOLD)[0])
    s.append(seg_text("STATUS", cols[2] - seg_width("STATUS", 7), y + 12, 7, GOLD)[0])
    y += 30
    rows = (("01", "AIR SERVICES", "DEPARTED"),
            ("02", "GROUND CREW", "BOARDING"),
            ("03", "CAP OFFICE", "ON TIME"),
            ("04", "-", "NOT ACKNOWLEDGED"))
    for cmd, unit, st in rows:
        s.append(f'<path stroke="{GOLD}" stroke-width="0.5" d="M{x0} {y} H{W-x0}"/>')
        s.append(seg_text(cmd, cols[0], y + 20, 20, GOLD)[0])
        s.append(seg_text(unit, cols[1], y + 23, 14, GOLD)[0])
        s.append(seg_text(st, cols[2] - seg_width(st, 11), y + 24.5, 11, GOLD)[0])
        y += 60
    s.append(f'<path stroke="{GOLD}" stroke-width="1" d="M{x0} {y} H{W-x0}"/>')
    y += 40
    s.append(seg_text(READOUT, x0, y, 40, GOLD)[0])
    s.append(seg_text("SALEM MA · PEAK SEASON OCT", x0, y + 60, 9, GOLD)[0])
    s.append(seg_text("THREE COMMANDS PER OWNER", x0, y + 80, 9, GOLD)[0])
    s.append(T(W - 36, H - 24, "FM-CAP-26-PST-1C · 18 × 24 IN · 1C 7406 C ON BLACK C", 7, fill=GOLD, anchor="end"))
    s.append(T(x0, H - 24, "THE CAP IS HELD IN-HOUSE.", 7, fill=GOLD))
    return svg("\n".join(s), vb=f"0 0 {W} {H}", title="Flying Monkey — departure board FM-CAP-26-PST-1C")

def pin_card():
    """3 × 4 in backing card for the head-only soft-enamel pin. Two inks on Kansas board."""
    s = [f'<rect x="0.5" y="0.5" width="299" height="399" fill="{BLANK}" stroke="{INK}" stroke-width="1"/>',
         f'<circle cx="150" cy="22" r="{r(5)}" fill="none" stroke="{INK}" stroke-width="1"/>',
         f'<g transform="translate(60 60) scale(0.75)">{mark(INK, GOLD, small=True, wings=False, tail=False)}</g>',
         f'<path stroke="{INK}" stroke-width="1" d="M20 236 H280"/>',
         wordmark(20, 248, 18, INK)[0],
         seg_text("GROUND CREW", 20, 300, 7, INK)[0],
         f'<path stroke="{INK}" stroke-width="1" d="M20 314 H280"/>',
         T(20, 328, "FM-GND-26-PIN-2C", 8, weight=700), T(280, 328, "COMMAND 02/03", 8, anchor="end"),
         T(20, 340, "SOFT ENAMEL · 1.25 IN · BLACK C + 7406 C", 6.5),
         T(280, 340, "HEAD ONLY · WINGS DETACHED", 6.5, anchor="end"),
         f'<path stroke="{INK}" stroke-width="1" d="M20 350 H280"/>',
         T(20, 364, SLOGAN, 7, weight=700),
         T(20, 378, "The Cap is held in-house.", 6),
         T(280, 390, PLACE, 5.5, anchor="end"), T(20, 390, "47 CANAL ST", 5.5),
         ]
    return svg("\n".join(s), vb="0 0 300 400", title="Flying Monkey — pin card FM-GND-26-PIN-2C")

def alphabet_specimen(fill=INK):
    rows = ["ABCDEFGHIKLMNOPRSTUVWXYZ", "0123456789 °′″·-/"]
    out, y = [], 0
    for t in rows:
        g, w = seg_text(t, 0, y, 22, fill); out.append(g); y += 34
    g, w = seg_text(READOUT, 0, y + 6, 44, fill); out.append(g)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 700 130">{"".join(out)}</svg>'

# ---------------------------------------------------------------- garment
def tee(fill, body):
    """A flat tee, front. Neck is an r=30 arc; shoulders and hem are straight."""
    p = (f'<path fill="{fill}" stroke="{RULE}" stroke-width="0.6" '
         f'd="M120 50 A30 30 0 0 0 180 50 L230 62 L260 130 L212 146 L212 290 L88 290 L88 146 L40 130 L70 62 Z"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">{p}{body}</svg>'

# ---------------------------------------------------------------- proof sheet
def sheet(assets_inline):
    m2 = mark(INK, GOLD); m1 = mark(INK, BLANK); mg = mark(GOLD, INK)
    m1s = mark(INK, BLANK, small=True); mgs = mark(GOLD, INK, small=True)
    inline = lambda body, vb="0 0 240 240", cls="": f'<svg class="{cls}" viewBox="{vb}" xmlns="http://www.w3.org/2000/svg">{body}</svg>'
    ladder = "".join(
        f'<div class="rung"><div style="width:{px}px">{inline(m1s if px < 96 else m1)}</div><span class="spec">{lab}</span></div>'
        for px, lab in ((24, "6mm"), (38, "1cm · LC teeth close"), (64, "17mm"), (96, "25mm"), (160, "42mm")))
    # full-front on black: 12in wide print on a ~20in chest. LC on Kansas: 3.5in.
    ff = tee(INK, f'<g transform="translate(78 92) scale(0.6)">{mg}</g>')
    lc = tee(BLANK, f'<g transform="translate(160 86) scale(0.16)">{m1s}</g>')
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Flying Monkey — Mascot Mark · FM-CAP-26-SHT-2C</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{{--ink:{INK};--gold:{GOLD};--blank:{BLANK};--rule:{RULE};--faint:{FAINT};
  --display:{DISPLAY};--mono:{MONO};}}
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{background:var(--blank);color:var(--ink);font-family:var(--display);-webkit-font-smoothing:antialiased}}
.page{{width:1600px;margin:0 auto;padding:0 0 48px;border-left:1px solid var(--rule);border-right:1px solid var(--rule)}}
.spec{{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:500}}
.spec b{{font-weight:700}}
.row{{display:grid;grid-template-columns:repeat(12,1fr);gap:0 16px;padding:0 24px;border-top:1px solid var(--rule)}}
.eyebrow{{grid-column:1/-1;display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--faint)}}
.cell{{padding:20px 0 28px}}
.cell.b{{border-left:1px solid var(--faint);padding-left:16px}}
h1{{font-size:200px;line-height:.86;letter-spacing:-.04em;font-weight:700;text-transform:uppercase}}
h2{{font-size:28px;letter-spacing:-.02em;font-weight:700;text-transform:uppercase;line-height:1}}
.masthead{{display:grid;grid-template-columns:8fr 4fr;gap:16px;padding:28px 24px 24px}}
.masthead .specblock{{border-left:1px solid var(--rule);padding-left:16px;display:flex;flex-direction:column;justify-content:space-between}}
.specblock table{{border-collapse:collapse;width:100%}}
.specblock td{{padding:5px 0;border-bottom:1px solid var(--faint);vertical-align:top}}
.specblock td:last-child{{text-align:right;font-weight:700}}
.slogan{{font-size:44px;letter-spacing:-.03em;font-weight:700;text-transform:uppercase;line-height:.95;margin-top:18px}}
.ground{{border:1px solid var(--rule);display:flex;align-items:center;justify-content:center;aspect-ratio:1}}
.ground.k{{background:var(--blank)}} .ground.w{{background:#fff}} .ground.i{{background:var(--ink)}} .ground.g{{background:var(--gold)}}
.ground svg{{width:82%;height:82%;display:block}}
.cap{{margin-top:8px;display:flex;justify-content:space-between}}
.ladder{{display:flex;align-items:flex-end;gap:36px;padding:24px 16px;border:1px solid var(--rule);background:#fff;height:100%}}
.rung{{display:flex;flex-direction:column;align-items:center;gap:10px}}
.rung svg{{display:block;width:100%;height:auto}}
.eph{{border:1px solid var(--rule);background:#fff;padding:24px;display:flex;align-items:center;justify-content:center;height:420px}}
.eph svg{{max-height:100%;max-width:100%}}
table.inks{{width:100%;border-collapse:collapse}}
table.inks th{{text-align:left;font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:500;padding:8px 0;border-bottom:1px solid var(--ink)}}
table.inks td{{padding:12px 0;border-bottom:1px solid var(--faint);font-size:15px;vertical-align:top}}
table.inks td.sw{{width:64px}} .chip{{width:48px;height:48px;border:1px solid var(--rule)}}
.mono{{font-family:var(--mono)}}
p{{font-size:15px;line-height:1.45;max-width:62ch}}
.big{{font-size:64px;font-weight:700;letter-spacing:-.035em;line-height:.95;text-transform:uppercase}}
.code{{font-family:var(--mono);font-size:56px;font-weight:700;letter-spacing:-.02em;line-height:1}}
.code small{{display:block;font-size:11px;letter-spacing:.08em;font-weight:500;margin-top:10px}}
.key{{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin-top:18px;font-size:13px}}
.key .k{{font-family:var(--mono);font-weight:700}}
.tee{{border:1px solid var(--rule);background:#fff;padding:16px}}
.tee svg{{width:100%;display:block}}
.foot{{padding:18px 24px 0;display:flex;justify-content:space-between;border-top:1px solid var(--ink)}}
</style></head><body><div class="page">

<div class="masthead">
  <div>
    <div class="spec" style="display:flex;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid var(--ink)">
      <span><b>FLYING MONKEY™</b> · AIR SERVICES · CAP OFFICE</span><span>SHEET FM-CAP-26-SHT-2C · EDITION 02 · POST-ICONOGRAPHIC</span></div>
    <div style="margin-top:22px;width:1000px">{inline(wordmark(0,0,60,INK)[0], vb=f"-2 -2 {wordmark(0,0,60,INK)[1]+4:.0f} {wordmark(0,0,60,INK)[2]+4:.0f}")}</div>
    <div style="display:flex;align-items:flex-end;gap:24px;margin-top:22px">
      <div style="width:420px">{inline(seg_text(READOUT,0,0,60,INK)[0], vb=f"-2 -2 {seg_text(READOUT,0,0,60,INK)[1]+4:.0f} 64")}</div>
      <div class="slogan" style="margin:0 0 4px;font-size:34px;white-space:nowrap">{SLOGAN}</div>
    </div>
  </div>
  <div class="specblock spec">
    <table>
      <tr><td>Issuing unit</td><td>CAP OFFICE</td></tr>
      <tr><td>Asset</td><td>MASCOT MARK · FM-01 · ED.02</td></tr>
      <tr><td>Edition</td><td>COMMAND 02/03</td></tr>
      <tr><td>Register</td><td>REPUBLIC</td></tr>
      <tr><td>Era</td><td>POST-ICONOGRAPHIC</td></tr>
      <tr><td>Grid</td><td>24U · 240 VIEWBOX</td></tr>
      <tr><td>Radii</td><td>R5 R10 R20 R30 R60</td></tr>
      <tr><td>Angles</td><td>0° · 90° · 42.52°</td></tr>
      <tr><td>Datum</td><td>SALEM MA 42.52°N</td></tr>
      <tr><td>Inks</td><td>2 · BLACK C · 7406 C</td></tr>
      <tr><td>Blank</td><td>KANSAS</td></tr>
    </table>
    <div><div style="width:120px">{inline(m2)}</div></div>
  </div>
</div>

<div class="row">
  <div class="eyebrow spec"><span><b>01 / THE MARK</b> · TWO INKS ON KANSAS</span><span>FM-01 · 240 × 240 · VECTOR</span></div>
  <div class="cell" style="grid-column:1/8"><div class="ground k">{inline(m2)}</div>
    <div class="cap spec"><span>2C · WINKIE BLACK + CAP GOLD</span><span>FULL FRONT 12 IN · 2.5 IN FROM HPS</span></div></div>
  <div class="cell b" style="grid-column:8/13">
    <div class="ground k">{inline(construction())}</div>
    <div class="cap spec"><span>CONSTRUCTION · ALL ARCS FROM THE RADIUS SET</span><span>WING EDGE = 42.52°</span></div>
    <p style="margin-top:22px">Every curve on the mark is one of five radii. Every straight edge is horizontal, vertical, or pitched at 42.52°, the latitude of Salem. Each wing carries three feathers, one per command the Golden Cap grants its wearer. The cap sits on the crown because the fleet holds its own cap now. The tail is the only asymmetry, and it is drawn from the same two radii as the ears and eyes. Edition 02 makes each wing a 7-segment <b>3</b> sheared to the latitude: three equal feathers on one spine. Rotate the wing flat and it reads as the digit.</p>
  </div>
</div>

<div class="row">
  <div class="eyebrow spec"><span><b>02 / SEPARATIONS</b> · ONE INK SURVIVES</span><span>THE GOLD VERSION IS THE PRODUCTION DEFAULT</span></div>
  <div class="cell" style="grid-column:1/4"><div class="ground k">{inline(m1)}</div><div class="cap spec"><span>1C BLACK ON KANSAS</span><span>FM-AIR-26-FF-1C</span></div></div>
  <div class="cell" style="grid-column:4/7"><div class="ground i">{inline(mg)}</div><div class="cap spec"><span>1C CAP GOLD ON BLACK</span><span>FM-AIR-26-FF-1C</span></div></div>
  <div class="cell" style="grid-column:7/10"><div class="ground g">{inline(m1)}</div><div class="cap spec"><span>1C BLACK ON CAP GOLD</span><span>FM-GND-26-LC-1C</span></div></div>
  <div class="cell" style="grid-column:10/13"><div class="ground w">{inline(m2)}</div><div class="cap spec"><span>2C ON WHITE PAPER</span><span>FM-CAP-26-STK-2C</span></div></div>
</div>

<div class="row">
  <div class="eyebrow spec"><span><b>03 / SIZE</b> · 6 MM TO 42 MM</span><span>BELOW 4 IN THE TEETH CLOSE AND THE CORD THICKENS TO 4U</span></div>
  <div class="cell" style="grid-column:1/8"><div class="ladder">{ladder}</div></div>
  <div class="cell b" style="grid-column:8/13">
    <div class="code">FM-AIR-26-FF-1C<small>CODE GRAMMAR · EVERY FIELD IS A REAL VALUE</small></div>
    <div class="key">
      <span class="k">FM</span><span>Flying Monkey</span>
      <span class="k">AIR · GND · CAP</span><span>Unit: Air Services (tees, hoods) · Ground Crew (headwear, bags) · Cap Office (print, ephemera)</span>
      <span class="k">26</span><span>Year of issue</span>
      <span class="k">FF · LC · FB · SL · TAG · STK · SHT</span><span>Placement or format: full front, left chest, full back, sleeve, hangtag, sticker, sheet</span>
      <span class="k">1C · 2C</span><span>Ink count on press</span>
    </div>
  </div>
</div>

<div class="row">
  <div class="eyebrow spec"><span><b>04 / EPHEMERA</b> · THE SYSTEM PAST THE FRAME</span><span>HANGTAG · SERVICE NOTICE · WOVEN LABEL</span></div>
  <div class="cell" style="grid-column:1/4"><div class="eph">{assets_inline['hangtag']}</div><div class="cap spec"><span>HANGTAG 2 × 3.5 IN · 1C ON KANSAS BOARD</span><span>FM-CAP-26-TAG-1C</span></div></div>
  <div class="cell" style="grid-column:4/8"><div class="eph">{assets_inline['notice']}</div><div class="cap spec"><span>SERVICE NOTICE · 3 IN ROUND · 1C GOLD ON BLACK VINYL</span><span>FM-CAP-26-STK-1C</span></div></div>
  <div class="cell" style="grid-column:8/13"><div class="eph" style="background:var(--blank)"><div style="width:100%">{assets_inline['label']}</div></div><div class="cap spec"><span>WOVEN NECK LABEL 60 × 25 MM · GOLD WEFT ON BLACK</span><span>FM-AIR-26-LBL-1C</span></div></div>
</div>

<div class="row">
  <div class="eyebrow spec"><span><b>05 / ON THE BLANK</b> · DESIGN ONTO THE GARMENT, NOT ONTO WHITE</span><span>PLASTISOL · 156 MESH · NO HALFTONE</span></div>
  <div class="cell" style="grid-column:1/5"><div class="tee">{ff}</div><div class="cap spec"><span>BLACK TEE · 1C CAP GOLD · FULL FRONT 12 IN</span><span>2.5 IN FROM HPS</span></div></div>
  <div class="cell" style="grid-column:5/9"><div class="tee">{lc}</div><div class="cap spec"><span>KANSAS TEE · 1C BLACK · LEFT CHEST 3.5 IN</span><span>TEETH CLOSED</span></div></div>
  <div class="cell b" style="grid-column:9/13">
    <table class="inks">
      <tr><th></th><th>Ink</th><th>Spec</th></tr>
      <tr><td class="sw"><div class="chip" style="background:var(--ink)"></div></td><td><b>Winkie Black</b><br><span class="spec">HEAD · WINGS · TAIL · TYPE</span></td><td class="mono">Pantone Black C<br>{INK}</td></tr>
      <tr><td class="sw"><div class="chip" style="background:var(--gold)"></div></td><td><b>Cap Gold</b><br><span class="spec">FACE · CAP · OWNED HUE</span></td><td class="mono">Pantone 7406 C<br>{GOLD}</td></tr>
      <tr><td class="sw"><div class="chip" style="background:var(--blank)"></div></td><td><b>Kansas</b><br><span class="spec">BLANK · GARMENT OR BOARD · NOT AN INK</span></td><td class="mono">Natural / heather blank<br>{BLANK}</td></tr>
    </table>
    <p style="margin-top:18px;font-size:13px">Thread references for embroidery are matched at digitizing against Black C and 7406 C. None are invented here.</p>
  </div>
</div>

<div class="row">
  <div class="eyebrow spec"><span><b>06 / THE SEGMENT ALPHABET</b> · ONE GRAMMAR, EVERY DIAGONAL IS THE LATITUDE</span><span>12 × 11 CELL · STROKE 2 · ATAN(11/12) = 42.51°</span></div>
  <div class="cell" style="grid-column:1/9"><div style="border:1px solid var(--rule);background:#fff;padding:28px">{alphabet_specimen()}</div>
    <div class="cap spec"><span>DRAWN, NOT SET · WIPEOUT BUILT ITS WORDMARK FROM 7-SEGMENT 8s · OURS FROM A CELL WHOSE DIAGONAL IS SALEM</span><span>FM-CAP-26-TYP</span></div></div>
  <div class="cell b" style="grid-column:9/13">
    <p><b>Why extended.</b> A 12-wide, 11-tall cell is the only proportion in which a corner-to-corner diagonal sits at 42.52°. K, M, N, R, V, X, Y and the prime marks all carry it. The face is wide because the datum makes it wide.</p>
    <p style="margin-top:12px"><b>Where it goes.</b> Wordmark, readout, unit names, the departure board, labels. Everything else stays in Space Grotesk and JetBrains Mono. The segment face is display only and never runs below 7 units cap height.</p>
    <p style="margin-top:12px"><b>The readout.</b> 42°31′12″N is 42.52° written the way WipEout wrote lap times: degrees, minutes, seconds. It is the wing angle, spelled out.</p>
  </div>
</div>

<div class="row">
  <div class="eyebrow spec"><span><b>07 / THE BOARD</b> · THE CAP OFFICE PUBLISHES THE SCHEDULE</span><span>18 × 24 IN · 1C 7406 C ON BLACK C</span></div>
  <div class="cell" style="grid-column:1/6"><div class="eph" style="height:720px;background:var(--blank)">{assets_inline['board']}</div><div class="cap spec"><span>DEPARTURE BOARD · POSTER, WINDOW, STORY FRAME</span><span>FM-CAP-26-PST-1C</span></div></div>
  <div class="cell" style="grid-column:6/10"><div class="eph" style="height:720px">{assets_inline['pin']}</div><div class="cap spec"><span>PIN CARD 3 × 4 IN · HEAD ONLY · 2C ON KANSAS BOARD</span><span>FM-GND-26-PIN-2C</span></div></div>
  <div class="cell b" style="grid-column:10/13">
    <div class="ground k">{inline(mark(INK, GOLD, small=True, wings=False, tail=False))}</div>
    <div class="cap spec"><span>HEAD CUT</span><span>PIN · FIGURE · PLUSH</span></div>
    <p style="margin-top:22px">The head ships alone as an object. Wings and tail are the apparel cut; the head is the collectible cut. Same radii, same face, one fewer part to mould.</p>
  </div>
</div>

<div class="row">
  <div class="eyebrow spec"><span><b>08 / THE BOUNCE</b> · TDR AGAINST WHAT IS WINNING NOW</span><span>EDITION 02 · WHAT WAS TAKEN, WHAT WAS REFUSED</span></div>
  <div class="cell" style="grid-column:1/5">
    <p><b>Mascots are back, and IP is the asset.</b> The 2026 brand story is characters that can carry a moment, not wordmarks that cannot. Taken: the head is built to be an object first, a print second. Refused: warmth. The stare stays.</p>
    <p style="margin-top:12px"><b>Collectible mascots</b> (Pop Mart's Labubu, Bearbrick before it) win on a silhouette that survives as a 1.25 in pin and a 6 in vinyl. Taken: the head-only cut and the pin card. Refused: the blind box. Three commands a year is the only scarcity mechanic.</p>
  </div>
  <div class="cell b" style="grid-column:5/9">
    <p><b>Deadpan corporate horror</b> (Liquid Death, Duolingo's dead owl) proves a brand can be macabre and still read as an institution. Taken: the departure board and the Cap Office voice. Refused: the wink. No status on the board is a joke; one is a rule.</p>
    <p style="margin-top:12px"><b>Guerrilla scarcity</b> (Corteiz's one mark and its rules) is a system, not a style. Taken: one mark everywhere, one owned colour, a rule you can quote. Refused: a second colourway per unit. WipEout gave every team a colour; Flying Monkey is one team.</p>
  </div>
  <div class="cell b" style="grid-column:9/13">
    <p><b>The WipEout revival</b> (30 years in September 2025, a Thames &amp; Hudson archive) means the look is being mined as a filter. Taken: the encoding trick only. The wing is a 7-segment digit and the readout is a lap time. Refused: katakana, fake sponsors, chrome.</p>
    <p style="margin-top:12px"><b>Salem.</b> The witch economy already has a mascot. Flying Monkey is the contractor that flies for it. The latitude is real, the address is real, the book is public domain, and 1692 stays out of the mark on purpose.</p>
  </div>
</div>

<div class="row">
  <div class="eyebrow spec"><span><b>09 / VOICE</b> · A BRAND TALKING ABOUT ITSELF WITH A STRAIGHT FACE</span><span>DEADPAN · IF IT WINKS, CUT IT</span></div>
  <div class="cell" style="grid-column:1/8"><div class="big">The Cap is held in-house. Requests for a fourth command are not acknowledged.</div></div>
  <div class="cell b" style="grid-column:8/13">
    <p><b>Type.</b> Wordmark and readout: the segment alphabet, drawn. Copy: Space Grotesk 700, all caps, tracking −4%, standing in for Suisse Int'l. Mono: JetBrains Mono for every code, dimension and coordinate, standing in for ABC Diatype Mono. One drawn face, two families.</p>
    <p style="margin-top:12px"><b>Provenance.</b> {PLACE}. Printed at 47 Canal Street. The latitude is in the wing; the address is on the tag.</p>
    <p style="margin-top:12px"><b>Source.</b> The Winged Monkeys, the Golden Cap and its three commands are from L. Frank Baum, <i>The Wonderful Wizard of Oz</i>, 1900, public domain. Nothing here is drawn from the 1939 film.</p>
  </div>
</div>

<div class="foot spec"><span><b>FLYING MONKEY™</b> · CAP OFFICE · FM-CAP-26-SHT-2C</span><span>{PLACE}</span><span>COMMAND 02/03</span></div>
</div></body></html>
"""
    return html

# ---------------------------------------------------------------- write
if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    for sub in ("mark", "ephemera", "sheet"):
        os.makedirs(f"{out}/{sub}", exist_ok=True)
    W = lambda p, s: open(f"{out}/{p}", "w").write(s)
    W("mark/fm-mark-2c.svg",            svg(mark(INK, GOLD),  title="Flying Monkey — mark, 2 inks (Winkie Black + Cap Gold) for light grounds"))
    W("mark/fm-mark-1c-black.svg",      svg(mark(INK, BLANK), title="Flying Monkey — mark, 1 ink (Winkie Black), face knocked out to the blank"))
    W("mark/fm-mark-1c-gold.svg",       svg(mark(GOLD, INK),  title="Flying Monkey — mark, 1 ink (Cap Gold) for black garments"))
    W("mark/fm-mark-1c-black-sm.svg",   svg(mark(INK, BLANK, small=True), title="Flying Monkey — mark under 4 in: teeth closed, cord 4u"))
    W("mark/fm-mark-1c-gold-sm.svg",    svg(mark(GOLD, INK, small=True),  title="Flying Monkey — mark under 4 in, Cap Gold"))
    W("mark/fm-head-2c.svg",            svg(mark(INK, GOLD, small=True, wings=False, tail=False), title="Flying Monkey — head only, for pins, figures and plush"))
    W("mark/fm-head-1c-gold.svg",       svg(mark(GOLD, INK, small=True, wings=False, tail=False), title="Flying Monkey — head only, Cap Gold on black"))
    wm, ww, wh = wordmark(0, 0, 60, INK)
    W("mark/fm-wordmark.svg",           svg(wm, vb=f"-2 -2 {ww+4:.0f} {wh+4:.0f}", title="Flying Monkey — wordmark in the segment alphabet"))
    ro, rw = seg_text(READOUT, 0, 0, 60, INK)
    W("mark/fm-readout.svg",            svg(ro, vb=f"-2 -2 {rw+4:.0f} 64", title="Flying Monkey — 42°31′12″N readout"))
    W("mark/fm-mark-construction.svg",  svg(construction(), bg=BLANK, title="Flying Monkey — construction: radius set and the 42.52° datum"))
    ht, sn, nl = hangtag(), service_notice(), neck_label()
    db, pc = departure_board(), pin_card()
    W("ephemera/fm-departure-board.svg", db)
    W("ephemera/fm-pin-card.svg", pc)
    W("ephemera/fm-hangtag.svg", ht)
    W("ephemera/fm-service-notice.svg", sn)
    W("ephemera/fm-neck-label.svg", nl)
    strip = lambda s: s[s.index("<svg"):]
    W("sheet/fm-proof-sheet.html", sheet({"hangtag": strip(ht), "notice": strip(sn), "label": strip(nl),
                                           "board": strip(db), "pin": strip(pc)}))
    print("built", out)
