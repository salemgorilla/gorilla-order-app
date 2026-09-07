#!/usr/bin/env python3
"""Flying Monkey — round two. The crest: a monkey skull with a fan of five feathers a side.
Drawn Béziers for the skull; five tapered feathers per wing radiating from one hidden shoulder.
One ink with knockouts. Run: python3 fm2.py <outdir>
"""
import math, sys, os

INK, GOLD, BLANK = "#111111", "#F1C400", "#F4F1EA"
RULE, FAINT = "#8E8674", "#D8D2C4"
M = 'transform="translate(240 0) scale(-1 1)"'

def mirror(path, fill):
    return f'<path fill="{fill}" d="{path}"/><path fill="{fill}" {M} d="{path}"/>'

def f(x): return f"{x:.1f}".rstrip("0").rstrip(".")

# ---------------------------------------------------------------- wing: five tapered feathers
SHOULDER = (140, 112)
FEATHERS = [(43,108,17), (27,100,16), (11,90,15), (-5,78,14), (-22,66,13)]   # angle, length, root width

def feather(ax, ay, ang, L, w):
    t = math.radians(ang)
    dx, dy = math.cos(t), -math.sin(t)
    px, py = -dy, dx                      # perpendicular
    wt = w * 0.78                          # tip width
    bx, by = ax - dx * 8, ay - dy * 8      # start a little behind the shoulder so roots overlap
    tx, ty = ax + dx * (L - wt/2), ay + dy * (L - wt/2)
    p = [(bx + px*w/2, by + py*w/2), (tx + px*wt/2, ty + py*wt/2), (tx - px*wt/2, ty - py*wt/2), (bx - px*w/2, by - py*w/2)]
    return (f"M{f(p[0][0])} {f(p[0][1])} L{f(p[1][0])} {f(p[1][1])} "
            f"A{f(wt/2)} {f(wt/2)} 0 0 0 {f(p[2][0])} {f(p[2][1])} "
            f"L{f(p[3][0])} {f(p[3][1])} A{f(w/2)} {f(w/2)} 0 0 0 {f(p[0][0])} {f(p[0][1])} Z")

def wings(ink):
    ax, ay = SHOULDER
    return "".join(mirror(feather(ax, ay, *fe), ink) for fe in FEATHERS)

# ---------------------------------------------------------------- skull: drawn, right half mirrored
SKULL_HALF = ("M118 30 C152 30 182 48 185 80 C187 90 184 96 186 102 "
              "C200 106 207 122 199 136 C193 146 185 148 183 156 "
              "C184 166 180 176 170 182 L118 188 Z")
SOCKET = "M133 104 C146 94 166 90 173 99 C179 109 176 128 162 134 C148 139 133 128 133 116 Z"
NASAL = ("M120 134 C127 140 133 148 133 158 C133 166 127 172 120 175 "
         "C113 172 107 166 107 158 C107 148 113 140 120 134 Z")
TEETH = ((121,10,15,"i",184), (133,10,14,"i",183), (145,9,12,"i",181), (156,9,24,"c",178), (167,6,9,"m",175))

def teeth(ink, small=False):
    out = ""
    for x, w, h, kind, y in TEETH:
        if small and kind == "m":
            continue
        if kind == "c":
            t = f"M{x} {y} L{x+w} {y} L{x+w-1} {y+h-10} C{x+w-2} {y+h-3} {x+w/2+1} {y+h} {x+w/2} {y+h} C{x+w/2-1} {y+h} {x+2} {y+h-3} {x+1} {y+h-10} Z"
        else:
            t = f"M{x} {y} L{x+w} {y} L{x+w-1} {y+h-4} C{x+w-2} {y+h} {x+2} {y+h} {x+1} {y+h-4} Z"
        out += mirror(t, ink)
    return out

def skull(ink, hole, small=False):
    return mirror(SKULL_HALF, ink) + mirror(SOCKET, hole) + f'<path fill="{hole}" d="{NASAL}"/>' + teeth(ink, small)

def crest(ink, hole, small=False, wings_on=True):
    body = f'<g transform="translate(120 122) scale(0.8) translate(-120 -110)">{skull(ink, hole, small)}</g>'
    return (wings(ink) if wings_on else "") + body

def svg(body, vb="0 0 240 240", bg=None, title=None):
    t = f"<title>{title}</title>" if title else ""
    bgr = f'<rect width="100%" height="100%" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{t}{bgr}{body}</svg>\n'

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "out2"
    os.makedirs(out, exist_ok=True)
    W = lambda p, s: open(f"{out}/{p}", "w").write(s)
    W("fm-crest-1c-black.svg", svg(crest(INK, BLANK), title="Flying Monkey — crest, one ink (black), knockouts to the blank"))
    W("fm-crest-1c-gold.svg",  svg(crest(GOLD, INK),  title="Flying Monkey — crest, one ink (Cap Gold) on black"))
    W("fm-crest-1c-black-sm.svg", svg(crest(INK, BLANK, small=True), title="Flying Monkey — crest under 3 in: molar dropped"))
    W("fm-skull-1c-black.svg", svg(crest(INK, BLANK, wings_on=False), title="Flying Monkey — skull only"))
    W("fm-skull-1c-gold.svg",  svg(crest(GOLD, INK, wings_on=False), title="Flying Monkey — skull only, Cap Gold"))
    body = crest(INK, BLANK); inv = crest(GOLD, INK); sm = crest(INK, BLANK, small=True)
    ladder = "".join(f'<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><svg viewBox="0 0 240 240" width="{px}">{sm if px < 90 else body}</svg><span style="font:10px monospace">{lab}</span></div>'
                     for px, lab in ((24,"6MM"),(38,"1CM"),(64,"17MM"),(96,"25MM"),(160,"42MM")))
    review = f'''<html><body style="margin:0;background:#888;padding:12px;display:grid;grid-template-columns:640px 1fr;gap:12px">
<div style="background:{BLANK}"><svg viewBox="0 0 240 240" width="640">{body}</svg></div>
<div style="display:grid;grid-template-rows:auto auto;gap:12px">
 <div style="display:flex;gap:12px"><svg viewBox="0 0 240 240" width="300" style="background:#111">{inv}</svg><svg viewBox="0 0 240 240" width="300" style="background:{GOLD}">{body}</svg></div>
 <div style="display:flex;gap:28px;align-items:flex-end;background:#fff;padding:16px">{ladder}<svg viewBox="0 0 240 240" width="160">{crest(INK, BLANK, wings_on=False)}</svg></div>
</div></body></html>'''
    W("review.html", review)
    print("ok")
