"""
Applications. The mark is the work; these are the places it has to live.

Roth's economy, unchanged in sixty-six years: the character sells the shirt,
the shirt funds the booth, the flyer is not a wrapper round the work — it is
another piece of the work, hand-lettered, price in the art.

Everything here is composed at print size in inches (100 units = 1 inch), so
placement measurements in the spec are read straight off the file rather than
worked out afterwards.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch as F
import letters as L
from ink import stroke, blob, EVEN, TAPER, WEDGE

K, G, R, W = F.INK["k"], F.INK["g"], F.INK["r"], F.INK["w"]
BLACK_BLANK = F.BLACK_BLANK
CHIP = "#C9B99A"          # FM-04 CHIPBOARD — the hangtag stock, uncoated
IN = 100.0                # user units per inch

LETTER = [(0.0, 0.90), (0.5, 1.0), (1.0, 0.90)]


def lf(pts, w=10, profile=None, closed=False, corners=()):
    return stroke(pts, w=w, profile=LETTER, closed=closed, corners=corners,
                  cap=0.45, step=3.5)


def say(s, x, y, size, ink=None, track=6, weight=1.0, seed=1, center=None):
    """Lettered line. `center` is an x to centre on."""
    if center is not None:
        x = center - L.width(s, size, track) / 2.0
    paths, w = L.text(lf, s, x=x, y=y, size=size, track=track,
                      weight=weight, seed=seed)
    ink = ink or K
    return "".join(f'<path fill="{ink}" d="{d}"/>' for d in paths if d), w


def rule(x0, y0, x1, y1, w=6, ink=None):
    return (f'<path fill="{ink or K}" '
            f'd="{stroke([(x0, y0), (x1, y1)], w=w, profile=EVEN, cap=0.3)}"/>')


def dashes(pts, seg=16, gap=12, w=4, ink=None):
    """A cut line, drawn as real dashes — there are no strokes in this file."""
    import math
    out = []
    total = 0.0
    for i in range(1, len(pts)):
        total += math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    d = 0.0
    while d < total:
        a, b = d, min(d + seg, total)
        pa, pb = _at(pts, a), _at(pts, b)
        out.append(f'<path fill="{ink or K}" '
                   f'd="{stroke([pa, pb], w=w, profile=EVEN, cap=0.3)}"/>')
        d += seg + gap
    return "".join(out)


def _at(pts, dist):
    import math
    acc = 0.0
    for i in range(1, len(pts)):
        seg = math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        if acc + seg >= dist:
            t = (dist - acc) / seg if seg else 0
            return (pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
                    pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t)
        acc += seg
    return pts[-1]


def mark(x, y, w, pal=None, uid="m", keyline=False, pad=26):
    bx, by, bw, bh = F.content_box(pad)
    k = w / bw
    g = F.mark_group(pal, uid=uid, keyline=keyline)
    return (f'<g transform="translate({x},{y}) scale({k:.5f}) '
            f'translate({-bx},{-by})">{g}</g>'), bh * k


def page(w, h, bg, body, name):
    open(name, "w").write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} '
        f'{h:.0f}" width="{w:.0f}" height="{h:.0f}">'
        f'<rect width="{w:.0f}" height="{h:.0f}" fill="{bg}"/>{body}</svg>')
    return name


# ============================================================== THE SHIRT ====
# Full front, 12in wide, 3in from HPS. One gag: the monkey, and what he came
# back with. The caption is lettered into the piece, not set beneath it.

def tee_front(path):
    PW, PH = 12 * IN, 15.4 * IN
    body = []
    m, mh = mark(0, 0, PW, uid="t")
    body.append(m)
    y = mh + 52
    body.append(say("FETCH", 0, y, 232, center=PW / 2, track=16, seed=3)[0])
    y += 232 + 46
    body.append(rule(60, y - 26, PW - 60, y - 26, w=7))
    body.append(say("SENT FOR THE GIRL.", 0, y, 62, center=PW / 2,
                    track=7, seed=11)[0])
    y += 62 + 20
    body.append(say("CAME BACK WITH A SHIRT.", 0, y, 62, center=PW / 2,
                    track=7, seed=12)[0])
    return page(PW, y + 84, W, "".join(body), path)


# =============================================================== THE FLYER ===
# The Car Craft mail-order register: dense, lettered, price in the art, coupon
# on the bottom edge. 5.5 x 8.5in, two inks on newsprint-weight stock.

def flyer(path):
    PW, PH = 5.5 * IN, 8.5 * IN
    b = []
    for seg in (((24, 24), (PW - 24, 24)), ((24, PH - 24), (PW - 24, PH - 24)),
                ((24, 24), (24, PH - 24)),
                ((PW - 24, 24), (PW - 24, PH - 24))):
        b.append(rule(seg[0][0], seg[0][1], seg[1][0], seg[1][1], w=9))

    b.append(say("THE MONKEY", 0, 54, 44, center=PW / 2, track=5, seed=4)[0])
    b.append(say("THAT QUIT", 0, 100, 44, center=PW / 2, track=5, seed=5,
                 ink=R)[0])
    m, mh = mark((PW - 250) / 2, 158, 250, uid="f")
    b.append(m)
    b.append(say("FETCH", 0, 392, 62, center=PW / 2, track=8, seed=3)[0])

    b.append(rule(46, 470, PW - 46, 470, w=6))
    y = 484
    for line, ink in (("HE WAS SENT FOR THE GIRL.", K),
                      ("HE CAME BACK WITH A SHIRT.", K),
                      ("THE STRAP IS STILL ON ESSEX ST.", R)):
        b.append(say(line, 0, y, 20, center=PW / 2, track=3, seed=7, ink=ink)[0])
        y += 25
    b.append(rule(46, 566, PW - 46, 566, w=6))

    # Price in the art, the way a Car Craft ad carries it. FIGURES ARE
    # PLACEHOLDERS — see the spec; nobody but Gabe sets these.
    y = 580
    for nm, price in (("TEE  S-3XL  3 COLOUR", "$28"),
                      ("DECAL SHEET  6 UP", "$6"),
                      ("ENAMEL PIN  1.25 IN", "$12")):
        pw = L.width(price, 20, 3)
        b.append(say(nm, 52, y, 20, track=3, seed=13)[0])
        b.append(say(price, PW - 52 - pw, y, 20, track=3, seed=14, ink=R)[0])
        b.append(dashes([(58 + L.width(nm, 20, 3), y + 19),
                         (PW - 60 - pw, y + 19)], seg=5, gap=7, w=3))
        y += 27

    b.append(say("CUT HERE", PW - 158, 664, 15, track=3, seed=15)[0])
    b.append(dashes([(30, 686), (PW - 30, 686)], seg=14, gap=10, w=4))
    b.append(say("MAIL TO - FLYING MONKEY", 0, 702, 18, center=PW / 2,
                 track=3, seed=16)[0])
    b.append(say("196 ESSEX ST. SALEM MASS. 01970", 0, 724, 16, center=PW / 2,
                 track=2, seed=17)[0])
    y = 756
    for lab in ("NAME", "TOWN"):
        b.append(say(lab, 52, y, 16, track=2, seed=18)[0])
        b.append(rule(112, y + 18, PW - 52, y + 18, w=4))
        y += 26
    b.append(say("FM-FTCH-FF12-3C-26", 0, 806, 13, center=PW / 2,
                 track=3, seed=19)[0])
    return page(PW, PH, W, "".join(b), path)


# ============================================================== EPHEMERA =====
# Rule 8 of the desk: the character has to appear on three things that are not
# a shirt, or the world stops at the garment and there is no booth.

MARK_RATIO = 0.8915          # content_box height / width, fixed by the drawing


def cut_box(x, y, w, h):
    return dashes([(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)],
                  seg=9, gap=7, w=3)


def ring_group(cx, cy, h):
    """The broken ring on its own — the story with the monkey taken out of it.
    Lifted straight off the collar, not redrawn, so the two cannot drift."""
    cf, cl, ca = F.collar()
    k = h / 98.0
    inner = ("".join(f'<path fill="{R}" d="{d}"/>' for d in ca[2:])
             + "".join(f'<path fill="{K}" d="{d}"/>' for d in cl[1:])
             + "".join(f'<path fill="{K}" d="{d}"/>' for d in cf[1:]))
    return (f'<g transform="translate({cx},{cy}) scale({k:.4f}) '
            f'translate(-530,-831)">{inner}</g>')


def decal_sheet(path):
    """Six up on one 5 x 7in sheet, kiss-cut. The cheapest object on the table
    and the one that ends up on somebody's laptop in another state."""
    PW, PH = 5 * IN, 7 * IN
    b = []
    for p0, p1 in (((20, 20), (PW - 20, 20)), ((20, PH - 20), (PW - 20, PH - 20)),
                   ((20, 20), (20, PH - 20)), ((PW - 20, 20), (PW - 20, PH - 20))):
        b.append(rule(p0[0], p0[1], p1[0], p1[1], w=5))
    b.append(say("FLYING MONKEY  DECAL SHEET  6 UP", 40, 38, 19, track=3,
                 seed=21)[0])

    # 1 — the mark, full colour, the one everybody takes
    w1 = 210
    b.append(mark(38, 78, w1, uid="d1")[0])
    b.append(cut_box(30, 70, w1 + 16, w1 * MARK_RATIO + 16))
    # 2 — the one-ink reduction, small
    w2 = 132
    b.append(mark(268, 78, w2, pal=F.MONO, uid="d2")[0])
    b.append(cut_box(260, 70, w2 + 16, w2 * MARK_RATIO + 16))
    # 3 — the ring alone
    b.append(ring_group(432, 216, 78))
    b.append(cut_box(398, 168, 68, 96))

    # 4 — the wordmark, wide
    b.append(say("FETCH", 0, 296, 82, center=PW / 2, track=10, seed=3)[0])
    b.append(cut_box(38, 286, PW - 76, 102))

    # 5 — the mark again, medium, for the back of a laptop
    w5 = 178
    b.append(mark(38, 424, w5, uid="d5")[0])
    b.append(cut_box(30, 416, w5 + 16, w5 * MARK_RATIO + 16))
    # 6 — the address block, the part that sends people to the door
    b.append(say("196 ESSEX ST.", 256, 440, 26, track=4, seed=22)[0])
    b.append(say("SALEM MASS.", 256, 476, 26, track=4, seed=23)[0])
    b.append(say("FLYING MONKEY", 256, 516, 19, track=3, seed=24)[0])
    b.append(cut_box(246, 424, 218, 138))

    b.append(say("FM-FTCH-DEC-6UP-26", 40, PH - 52, 15, track=3, seed=25)[0])
    return page(PW, PH, W, "".join(b), path)


def pin(path):
    """1.25in hard enamel, shown at 3.2in. No wordmark: if the mascot needs
    lettering to say who it is, the mascot is not finished. This is the test."""
    S = 3.2 * IN
    c = S / 2
    b = [f'<circle cx="{c}" cy="{c}" r="{c - 22}" fill="{K}"/>',
         f'<circle cx="{c}" cy="{c}" r="{c - 40}" fill="{G}"/>']
    w = 206
    b.append(mark(c - w / 2, c - w * MARK_RATIO / 2, w, uid="p",
                  keyline=True)[0])
    return page(S, S, W, "".join(b), path)


def hangtag(path):
    """2 x 3.5in, one ink on uncoated chipboard. The furniture points at real
    values — the placement, the ink system, the street — because invented spec
    furniture is costume."""
    PW, PH = 2 * IN, 3.5 * IN
    b = [f'<circle cx="{PW / 2}" cy="32" r="10" fill="{CHIP}"/>',
         f'<path fill="{K}" d="'
         + stroke([(PW / 2 - 16, 32), (PW / 2, 16), (PW / 2 + 16, 32),
                   (PW / 2, 48)], w=7, profile=EVEN, closed=True) + '"/>']
    w = 124
    b.append(mark((PW - w) / 2, 60, w, pal=F.MONO, uid="h")[0])
    b.append(say("FETCH", 0, 186, 30, center=PW / 2, track=5, seed=3)[0])
    b.append(rule(26, 232, PW - 26, 232, w=4))
    y = 246
    for line in ("FM-FTCH-FF12-3C-26", "FULL FRONT 12 IN", "3 SPOT PLASTISOL",
                 "110 MESH  35 LPI"):
        b.append(say(line, 0, y, 12, center=PW / 2, track=2, seed=26)[0])
        y += 17
    b.append(rule(26, 320, PW - 26, 320, w=4))
    b.append(say("PRINTED IN SALEM", 0, 330, 12, center=PW / 2, track=2,
                 seed=27)[0])
    return page(PW, PH, CHIP, "".join(b), path)


if __name__ == "__main__":
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "art")
    for fn, nm in ((tee_front, "tee-front.svg"), (flyer, "flyer.svg"),
                   (decal_sheet, "decal-sheet.svg"), (pin, "pin.svg"),
                   (hangtag, "hangtag.svg")):
        print(fn(os.path.join(here, nm)))
