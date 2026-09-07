#!/usr/bin/env python3
"""Flying Monkey — round three. A frontal flying monkey, wings spread, one silhouette with knockouts.
The construction the Bacardi bat uses: symmetrical spread wings, a creature in the middle, one signature
asymmetry (the tail). Run: python3 fm3.py <outdir>"""
import math, sys, os
INK, GOLD, BLANK = "#111111", "#F1C400", "#F4F1EA"
RULE, FAINT = "#8E8674", "#D8D2C4"
M = 'transform="translate(240 0) scale(-1 1)"'
def f(x): return f"{x:.1f}".rstrip("0").rstrip(".")
def P(d, fill, mir=False): return f'<path fill="{fill}" {M if mir else ""} d="{d}"/>'
def both(d, fill): return P(d, fill) + P(d, fill, True)

# ---------------------------------------------------------------- wing
ANCHOR = (134, 104)
FEATHERS = [(46,112,27),(30,110,27),(14,104,26),(-2,94,25),(-18,82,23),(-34,68,21)]
SOLID = 0.66

def lobe(ax, ay, ang, L, w):
    t = math.radians(ang); dx, dy = math.cos(t), -math.sin(t); px, py = -dy, dx
    wt = w*0.8; bx, by = ax - dx*4, ay - dy*4
    tx, ty = ax + dx*(L-wt/2), ay + dy*(L-wt/2)
    p = [(bx+px*w/2, by+py*w/2), (tx+px*wt/2, ty+py*wt/2), (tx-px*wt/2, ty-py*wt/2), (bx-px*w/2, by-py*w/2)]
    return (f'M{f(p[0][0])} {f(p[0][1])} L{f(p[1][0])} {f(p[1][1])} A{f(wt/2)} {f(wt/2)} 0 0 0 {f(p[2][0])} {f(p[2][1])} '
            f'L{f(p[3][0])} {f(p[3][1])} A{f(w/2)} {f(w/2)} 0 0 0 {f(p[0][0])} {f(p[0][1])} Z')

def sector(ax, ay, a0, a1, r):
    pts = [(ax + r*math.cos(math.radians(a0+(a1-a0)*i/16)), ay - r*math.sin(math.radians(a0+(a1-a0)*i/16))) for i in range(17)]
    return f"M{f(ax)} {f(ay)} L" + " L".join(f"{f(x)} {f(y)}" for x,y in pts) + " Z"

def wings(ink):
    ax, ay = ANCHOR
    parts = [lobe(ax, ay, *fe) for fe in FEATHERS]   # wide bases overlap to the root; no sector needed
    return "".join(both(d, ink) for d in parts)

# ---------------------------------------------------------------- body
def taper(pts, widths, ink):
    """a limb: consecutive round-capped segments, each narrower than the last, joints filled"""
    s = ""
    for (x1,y1),(x2,y2),w in zip(pts, pts[1:], widths):
        s += f'<path stroke="{ink}" stroke-width="{w}" stroke-linecap="round" fill="none" d="M{f(x1)} {f(y1)} L{f(x2)} {f(y2)}"/>'
    return s

def body(ink, hole):
    s = []
    # tail: the one asymmetry. Out from under the torso, down and left, into a curl.
    s.append(f'<path stroke="{ink}" stroke-width="8" stroke-linecap="round" fill="none" d="M118 176 C112 196 94 210 76 202 C62 196 64 180 76 180 C86 180 84 194 74 192"/>')
    for sgn in (-1, 1):
        X = lambda x: 120 + sgn*(x-120)
        # leg: hip, knee, ankle; foot as an angled ellipse
        s.append(taper([(X(110),164),(X(100),184),(X(90),192)], (10,10), ink))
        s.append(f'<ellipse cx="{f(X(84))}" cy="194" rx="9" ry="5.5" transform="rotate({-25*sgn} {f(X(84))} 194)" fill="{ink}"/>')
        # arm: shoulder, elbow, wrist; hand as a mitt with a thumb
        s.append(taper([(X(103),118),(X(82),138),(X(75),162)], (11,11), ink))
        s.append(f'<ellipse cx="{f(X(74))}" cy="168" rx="7" ry="8.5" fill="{ink}"/>')
        s.append(f'<circle cx="{f(X(81))}" cy="163" r="3.5" fill="{ink}"/>')
    # torso: chest over belly
    s.append(f'<ellipse cx="120" cy="134" rx="27" ry="26" fill="{ink}"/>')
    s.append(f'<ellipse cx="120" cy="152" rx="22" ry="26" fill="{ink}"/>')
    # head and ears
    for cx in (92,148): s.append(f'<circle cx="{cx}" cy="96" r="12" fill="{ink}"/>')
    s.append(f'<circle cx="120" cy="100" r="30" fill="{ink}"/>')
    # face: inverted-heart plate knocked out; eyes and a row of teeth back in ink
    s.append(f'<path fill="{hole}" d="M120 88 C126 78 142 80 142 96 C142 110 130 120 120 124 C110 120 98 110 98 96 C98 80 114 78 120 88 Z"/>')
    s.append(both("M104 96 C110 92 116 96 114 102 C112 106 106 106 104 102 Z", ink))
    s.append(f'<path fill="{ink}" d="M108 112 L132 112 L131 116 L127 114 L124 117 L120 114 L116 117 L113 114 L109 116 Z"/>')
    return "".join(s)

def monkey(ink, hole): return wings(ink) + body(ink, hole)

def svg(inner, bg=None, title=None):
    t = f"<title>{title}</title>" if title else ""
    bgr = f'<rect width="100%" height="100%" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">{t}{bgr}{inner}</svg>\n'

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "out3"
    os.makedirs(out, exist_ok=True)
    b = monkey(INK, BLANK); g = monkey(GOLD, INK)
    open(f"{out}/fm-mark-1c-black.svg","w").write(svg(b, title="Flying Monkey — mark, one ink (black), knockouts to the blank"))
    open(f"{out}/fm-mark-1c-gold.svg","w").write(svg(g, title="Flying Monkey — mark, one ink (Cap Gold) on black"))
    ladder = "".join(f'<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><svg viewBox="0 0 240 240" width="{px}">{b}</svg><span style="font:10px monospace">{lab}</span></div>'
                     for px, lab in ((16,"4MM"),(24,"6MM"),(38,"1CM"),(64,"17MM"),(96,"25MM"),(160,"42MM")))
    open(f"{out}/review.html","w").write(f'''<html><body style="margin:0;background:#888;padding:12px;display:grid;grid-template-columns:640px 1fr;gap:12px">
<div style="background:{BLANK}"><svg viewBox="0 0 240 240" width="640">{b}</svg></div>
<div style="display:grid;grid-template-rows:auto auto;gap:12px">
 <div style="display:flex;gap:12px"><svg viewBox="0 0 240 240" width="300" style="background:#111">{g}</svg><svg viewBox="0 0 240 240" width="300" style="background:{GOLD}">{b}</svg></div>
 <div style="display:flex;gap:24px;align-items:flex-end;background:#fff;padding:16px">{ladder}</div>
</div></body></html>''')
    print("ok")
