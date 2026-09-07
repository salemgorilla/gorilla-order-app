"""
FETCH — the Flying Monkey mascot.

Sent to fetch the girl. Came back with a t-shirt.

Register: Aerosol. Method: Roth's weirdo-shirt logic (Car Craft, Jul 1963)
transposed onto Essex Street rather than pasted onto it.

Inversion target, named: the licensed winged-monkey plush — collared,
uniformed, servile, feather-winged, bilaterally symmetrical, sphere-headed,
mouth smaller than its face. Every decision below is the opposite of one of
those, and the list is the design brief.

Construction rules held everywhere in this file:
  1. No path in the output carries a stroke. Every line is a closed filled
     outline compiled from a centreline and a pressure curve (see ink.py).
     A stroke has one weight; a brush has a belly. That is the whole
     difference between a drawn mark and clip art.
  2. Contour lines lift toward zero at their ends. A line that stops at full
     weight is a vector artefact.
  3. Shading is a real 35 LPI dot grid at 22.5 degrees — a 110 mesh screen on
     cotton — at full ink strength, never a transparency. The dot does the
     lightening, the way it does on the press.
  4. Nothing is mirrored. The right wing opens further and hangs lower, the
     brows disagree with each other, the tuft is off-centre, and the head is
     cocked 6 degrees on a neck that is not.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ink import (stroke, blob, halftone,
                 TAPER, TAPER_IN, TAPER_OUT, EVEN, WEDGE)

# --------------------------------------------------------------- the inks ---
# Four names, four real Salem objects with dates. A palette named after the
# place it is printed in, not after a mood board.

INK = {
    "k": "#161311",   # FM-01  FRIENDSHIP BLACK  hull of the 1797 Friendship
    "g": "#5E8A7B",   # FM-02  CUSTOM HOUSE VERDIGRIS  the 1819 copper roof
    "r": "#D0452F",   # FM-03  DERBY LIGHT RED   the 1871 wharf lantern
    "w": "#EFE7D6",   # FM-00  BONE              the blank, printed as an ink
}


# ================================================================ THE WINGS ==
# Membrane and finger armature, because the plush has tidy feathers. The
# scallops fall between the digits where a wing's scallops actually fall.

def _wing_pts(s, ext, drop):
    """s = -1 viewer-left, +1 viewer-right.

    Bat geometry, done properly: the arm runs shoulder -> elbow -> wrist along
    the leading margin, and the four digits fan out from the wrist. Their tips
    make the trailing margin, scalloped inward between them. The membrane is
    the span between the two.
    """
    def q(x, y):
        return (500 + s * (x - 500) * ext, y + drop)

    root, elbow, wrist = q(392, 790), q(330, 630), q(292, 404)
    d2, d3, d4, d5 = q(182, 126), q(48, 322), q(60, 552), q(158, 710)
    s1, s2, s3, s4 = q(174, 274), q(104, 442), q(148, 622), q(278, 736)

    outline = [root, elbow, wrist, d2, s1, d3, s2, d4, s3, d5, s4]
    # Only the wrist, the tip and the last digit are sharp. Every scallop and
    # the two middle digits stay round — an all-sharp wing reads as a torn
    # cape, and a cape is not what he flies with.
    corners = {2, 3, 9}
    bones = [[wrist, q(178, 356), d3], [wrist, q(170, 480), d4],
             [wrist, q(198, 588), d5]]
    thumb = [wrist, q(262, 342), q(252, 306)]
    return outline, corners, bones, thumb


def wing(s):
    ext, drop = (1.0, 0) if s < 0 else (1.04, 34)
    outline, corners, bones, thumb = _wing_pts(s, ext, drop)
    fills = [blob(outline, corners=corners, smooth=0.85)]
    lines = [stroke(outline, w=15, profile=EVEN, closed=True,
                    corners=corners, smooth=0.85)]
    for b in bones:
        lines.append(stroke(b, w=10, profile=TAPER_OUT))
    lines.append(stroke(thumb, w=15, profile=WEDGE))
    return fills, lines


def wing_clip(s):
    ext, drop = (1.0, 0) if s < 0 else (1.04, 34)
    outline, corners, _b, _t = _wing_pts(s, ext, drop)
    return blob(outline, corners=corners, smooth=0.85)


# ================================================================ THE TORSO ==
# Small, hunched, and rolled forward. The plush stands at attention.

TORSO = [(420, 688), (344, 730), (288, 800), (268, 878), (266, 950),
         (734, 950), (732, 872), (710, 796), (652, 728), (582, 686)]
TORSO_CORNERS = {4, 5}


def torso():
    return (blob(TORSO, corners=TORSO_CORNERS),
            stroke(TORSO, w=16, profile=EVEN, closed=True,
                   corners=TORSO_CORNERS))


def chest():
    """Sternum and the two collarbone hollows — three lines, no more."""
    return [
        stroke([(500, 876), (498, 938)], w=9),
        stroke([(396, 842), (446, 870), (496, 880)], w=10, profile=TAPER),
        stroke([(604, 838), (554, 866), (502, 878)], w=10, profile=TAPER),
    ]


# =============================================================== THE COLLAR ==
# The story, in one shape. In Baum (1900) the winged monkeys are bound by the
# Golden Cap. This one broke the strap. The band is the only straight-edged
# object on the mark, so it is what the eye finds after the grin — and the
# ring hangs open, which is the whole gag in a silhouette.

def collar():
    band = [(392, 706), (444, 748), (502, 760), (562, 750), (616, 710),
            (622, 754), (562, 796), (502, 806), (442, 794), (388, 750)]
    bc = {0, 4, 5, 9}
    fills = [blob(band, corners=bc)]
    lines = [stroke(band, w=13, profile=EVEN, closed=True, corners=bc)]
    accents = []
    for x, y in ((446, 772), (556, 772)):
        accents.append(blob([(x - 12, y), (x, y - 12), (x + 12, y),
                             (x, y + 12)], smooth=1.15))
    # A small hanging loop with a bite out of it. Small, because the gag is
    # that it is broken, not that it is jewellery — and a broken circle is the
    # one shape the eye completes for itself at 1cm.
    cx, cy, R = 530, 838, 38
    gap0, gap1 = -1.30, -0.90         # a 23 degree break, top right
    outer, inner = [], []
    n = 15
    for i in range(n + 1):
        a = gap1 + (2 * math.pi + gap0 - gap1) * i / n
        outer.append((cx + R * math.cos(a), cy + R * math.sin(a)))
        inner.append((cx + (R - 13) * math.cos(a), cy + (R - 13) * math.sin(a)))
    band = outer + list(reversed(inner))
    kc = {0, len(outer) - 1, len(outer), len(band) - 1}
    accents.append(blob(band, corners=kc, smooth=0.55))
    lines.append(stroke(band, w=9, profile=EVEN, closed=True,
                        corners=kc, smooth=0.55))
    # the tab it hangs from, riveted through the strap
    fills.append(blob([(506, 782), (554, 782), (556, 812), (504, 812)],
                      corners={0, 1, 2, 3}, smooth=0.4))
    lines.append(stroke([(506, 782), (554, 782), (556, 814), (504, 814)],
                        w=9, profile=EVEN, closed=True,
                        corners={0, 1, 2, 3}, smooth=0.4))
    return fills, lines, accents


# ================================================================= THE EARS ==
# Wide, low, and clear of the wings. The left one is short a piece; it went
# at the same time as the strap.

EAR_R = [(700, 408), (762, 378), (830, 404), (858, 474),
         (836, 546), (766, 568), (704, 534)]
EAR_L = [(300, 428), (240, 394), (168, 418), (140, 490),
         (166, 564), (238, 588), (298, 552)]
EAR_L_CUT = {2, 3}


def ears():
    fills, lines = [], []
    pts_l = [(300, 428), (240, 392), (190, 404), (232, 452), (168, 476),
             (152, 534), (196, 580), (262, 590), (298, 552)]
    for pts, cor in ((EAR_R, ()), (pts_l, {2, 3, 4})):
        fills.append(blob(pts, corners=cor))
        lines.append(stroke(pts, w=13, profile=EVEN, closed=True, corners=cor))
    lines.append(stroke([(726, 436), (792, 452), (806, 512)], w=8))
    lines.append(stroke([(276, 462), (214, 484), (206, 538)], w=8))
    return fills, lines


# ================================================================= THE HEAD ==
# Wide at the brow, cheekbones flared, jaw rolled under. The plush's head is a
# sphere and a sphere is a toy. One tuft, off-centre, cut into the silhouette
# rather than laid on top of it — fur as structure, not as scribble.

SKULL = [
    (500, 246), (568, 250), (630, 278), (678, 328), (704, 394),
    (712, 452), (700, 522), (676, 596), (640, 676), (576, 732),
    (500, 750), (424, 732), (360, 676), (324, 596), (300, 522),
    (288, 452), (296, 394), (322, 328), (370, 278), (438, 252),
    (448, 224), (470, 246), (486, 230), (508, 250), (552, 240),
]
SKULL_CORNERS = {20, 22, 24}


def head_mass():
    return blob(SKULL, corners=SKULL_CORNERS)


def head_line():
    return stroke(SKULL, w=17, profile=EVEN, closed=True,
                  corners=SKULL_CORNERS)


# ----------------------------------------------------------------- brows ---
# The left is up (amused), the right is driven down (bored). A face doing two
# things at once is the whole expression, and it is why this cannot be
# mirrored.

def brows():
    return [
        stroke([(318, 424), (386, 396), (452, 410), (492, 444)],
               w=32, profile=TAPER_IN),
        stroke([(700, 420), (636, 444), (572, 476), (528, 496)],
               w=38, profile=TAPER_IN),
        stroke([(496, 452), (508, 472), (516, 492)], w=11),   # glabella crease
    ]


# ------------------------------------------------------------------ eyes ---

EYE_L = [(360, 500), (392, 458), (444, 462), (466, 500),
         (446, 546), (394, 550), (364, 530)]
EYE_R = [(546, 528), (592, 508), (644, 518), (656, 542),
         (614, 556), (568, 552)]


def eyes():
    whites = [blob(EYE_L), blob(EYE_R)]
    darks = [
        blob([(414, 492), (440, 500), (442, 528), (418, 538), (400, 520),
              (400, 500)]),
        blob([(596, 524), (620, 530), (618, 550), (594, 550), (586, 538)]),
    ]
    lines = [
        stroke(EYE_L, w=11, profile=EVEN, closed=True),
        stroke(EYE_R, w=11, profile=EVEN, closed=True),
        # the lid pressing the right eye shut to a slot
        stroke([(542, 524), (590, 500), (648, 512), (662, 540)],
               w=16, profile=TAPER),
        stroke([(356, 494), (382, 452), (430, 444)], w=13, profile=TAPER),
        # one bag under the open eye. He has been up.
        stroke([(378, 562), (410, 574), (446, 566)], w=8),
    ]
    vessels = [
        stroke([(370, 522), (388, 532), (400, 528)], w=5),
        stroke([(368, 508), (386, 504)], w=4.5),
        stroke([(556, 540), (574, 546)], w=4.5),
    ]
    return whites, lines, darks, vessels


# --------------------------------------------------------------- the muzzle --
# The primate signal. Frontally a monkey's muzzle is a rounded mass sitting on
# the lower face with the nostrils at its top and the mouth across its middle;
# get this shape wrong and the whole thing reads as a goblin.

# The bare face. Every primate has one and no gremlin does, so this single
# shape is what stops the mark reading as a Halloween goblin.
#
# On the bone blank it is printed in NO INK AT ALL — the garment showing
# through is the second value. That is the production constraint doing the
# drawing (design-taste principle 1, move 5), and it takes the colour count
# down, not up.
MASK = [(500, 434), (562, 444), (612, 488), (640, 556), (644, 640),
        (606, 706), (500, 748), (394, 706), (356, 640), (360, 556),
        (388, 488), (438, 444)]


def face_mask():
    return blob(MASK)


def face_line():
    """Where fur meets skin, inked in two lifts rather than one closed ring.
    A continuous outline round the face would read as a mask laid on top; a
    line that breaks at the brow reads as fur growing down to meet skin."""
    return [
        stroke([(438, 444), (388, 488), (360, 556), (356, 640), (394, 706),
                (464, 746)], w=13, profile=TAPER),
        stroke([(562, 444), (612, 488), (640, 556), (644, 640), (606, 706),
                (536, 748)], w=13, profile=TAPER),
        # the fur breaking over the brow, three short lifts, no more
        stroke([(456, 440), (474, 430)], w=9),
        stroke([(500, 428), (520, 434)], w=8),
        stroke([(346, 578), (326, 610)], w=9),
        stroke([(654, 572), (674, 604)], w=9),
    ]


def nose():
    return [
        stroke([(502, 534), (494, 566), (504, 582)], w=9),
        stroke([(462, 578), (484, 594), (506, 584)], w=16, profile=TAPER),
        stroke([(532, 576), (556, 590), (568, 576)], w=16, profile=TAPER),
    ]


# ------------------------------------------------------------------- grin ---
# Corners run past the outside of the eyes and the mouth is wider than the
# muzzle can hold. The plush smiles inside its face.

MOUTH = [(384, 600), (440, 664), (500, 690), (568, 664), (624, 590),
         (612, 668), (554, 750), (468, 752), (410, 668)]
MOUTH_CORNERS = {0, 4}

# x, lip-y, width, depth. Narrow, with red between every pair — the gaps do
# the separating, so no line has to. One is missing; it is not a chip, it is
# gone, and the hole is the joke.
TEETH = [(414, 632, 28, 42), (456, 668, 30, 44), (496, 686, 30, 42),
         (566, 664, 30, 44), (600, 628, 26, 40)]


def mouth():
    dark = [blob(MOUTH, corners=MOUTH_CORNERS)]
    lines = [stroke(MOUTH, w=15, profile=EVEN, closed=True,
                    corners=MOUTH_CORNERS)]
    teeth = []
    for x, y, w, h in TEETH:
        pts = [(x - w / 2, y - 14), (x + w / 2, y - 14),
               (x + w / 2 - 3, y + h), (x - w / 2 + 3, y + h)]
        teeth.append(blob(pts, corners={0, 1, 2, 3}, smooth=0.3))
    # two lowers pushing up through the gap, undershot
    # one lower canine driven up through the hole where the upper one was
    teeth.append(blob([(516, 748), (534, 692), (552, 750)],
                      corners={0, 1, 2}, smooth=0.35))
    teeth.append(blob([(470, 750), (486, 712), (504, 750)],
                      corners={0, 1, 2}, smooth=0.35))
    return dark, lines, teeth


def ear_skin():
    """Bare inner ear, same no-ink logic as the face."""
    return [
        blob([(736, 414), (798, 424), (820, 476), (800, 534), (744, 546),
              (716, 486)]),
        blob([(268, 428), (216, 442), (196, 490), (216, 546), (268, 560),
              (292, 496)]),
    ]


# ============================================================== THE HALFTONE ==
# 35 LPI at 22.5 degrees, full-strength ink. Design-taste principle 1, move 5:
# a production constraint authoring the form. The dot is meant to be visible
# on the garment.

PITCH = 17.0
DOT_MAX = 9.6


def _field(defs, idx, clip_d, bbox, tone):
    """tone(x, y) -> 0..1 coverage. Dot area follows coverage, as on a press."""
    cid = f"ht{idx}"
    defs.append(f'<clipPath id="{cid}"><path d="{clip_d}"/></clipPath>')

    def rf(x, y):
        return DOT_MAX * (max(0.0, min(1.0, tone(x, y))) ** 0.8) * 0.5

    return halftone(bbox, PITCH, 22.5, rf, cid)


def _seeds(seeds, fall):
    def tone(x, y):
        return max(1.0 - min(1.0, math.hypot(x - sx, y - sy) / fall)
                   for sx, sy in seeds)
    return tone


def _ramp(y0, y1, edge=None):
    """Dense at y0, gone by y1. `edge` adds a rim along the outer contour."""
    def tone(x, y):
        t = 1.0 - (y - y0) / (y1 - y0)
        if edge:
            ex, ew = edge
            t = max(t, 1.0 - abs(abs(x - 500) - ex) / ew)
        return t
    return tone


def shading_head(defs, pal=None):
    """Fields in head space — these ride inside the rotated head group."""
    out = []
    if pal is not None and pal.get("g") == "w":
        # In one ink the fur has no flat to sit on, so the dot carries it.
        cid = "furclip"
        defs.append(f'<clipPath id="{cid}" clip-rule="evenodd">'
                    f'<path clip-rule="evenodd" d="'
                    + blob(SKULL, corners=SKULL_CORNERS) + " "
                    + blob(list(reversed(MASK))) + '"/></clipPath>')

        def rf(x, y):
            return DOT_MAX * 0.30

        out.append(halftone((286, 210, 716, 756), PITCH, 22.5, rf, cid))
    # One crescent, on the side the head turns away from. Two would be
    # symmetry and symmetry is the plush.
    out.append(_field(defs, 1,
                      blob([(714, 446), (700, 520), (666, 588), (624, 650),
                            (652, 620), (674, 540), (676, 456)]),
                      (612, 430, 730, 668),
                      _seeds([(700, 486), (686, 556), (652, 620)], 56)))
    return out


def shading_body(defs):
    """Fields in page space."""
    return [_field(defs, 3,
                   blob([(352, 788), (430, 820), (500, 828), (572, 818),
                         (652, 784), (676, 842), (582, 884), (500, 894),
                         (416, 882), (326, 840)]),
                   (300, 776, 700, 896), _ramp(800, 880)),
            _field(defs, 4, wing_clip(-1), (50, 140, 400, 810),
                   _seeds([(224, 500), (262, 640), (196, 372)], 126)),
            _field(defs, 5, wing_clip(+1), (600, 170, 960, 840),
                   _seeds([(782, 526), (744, 666), (810, 400)], 126))]


# ================================================================= ASSEMBLE ==

# Reductions. Not "make it grey" — a real separation reduction: the fur drops
# out to the blank, the mouth interior takes the black, and the teeth stay a
# knockout. This is the version that has to survive at 1cm.
# "gw" is the wing membrane, separated from the body so the reduction can
# take it solid. In one ink the wings ARE the mass; without them the mark is a
# colouring-book outline and dies at badge size.
MONO = {"k": "k", "g": "w", "gw": "k", "r": "k", "w": "w"}
FULL = {"k": "k", "g": "g", "gw": "g", "r": "r", "w": "w"}


def build(pal=None, ink=None, keyline=False):
    """keyline: spread the outer silhouette in FM-00 so the mark keeps its
    edge on a dark blank, where the black contour would otherwise be the
    garment. A real choke, laid down under everything, not a glow."""
    pal = pal or FULL
    ink = ink or INK
    defs, P = [], []

    def add(ds, k):
        for d in ds:
            if d:
                P.append(f'<path fill="{ink[pal[k]]}" d="{d}"/>')

    wfl, wll = wing(-1)
    wfr, wlr = wing(+1)
    if keyline:
        kw = 46
        add([wing_clip(-1), wing_clip(+1)], "w")
        for sd in (-1, 1):
            o, c, _b, _t = _wing_pts(sd, *((1.0, 0) if sd < 0 else (1.04, 34)))
            add([stroke(o, w=kw, profile=EVEN, closed=True, corners=c,
                        smooth=0.85)], "w")
        add([blob(TORSO, corners=TORSO_CORNERS),
             stroke(TORSO, w=kw, profile=EVEN, closed=True,
                    corners=TORSO_CORNERS)], "w")
        for pts in (EAR_R, EAR_L):
            add([blob(pts), stroke(pts, w=kw, profile=EVEN, closed=True)], "w")
        add([head_mass(), head_line(),
             stroke(SKULL, w=kw, profile=EVEN, closed=True,
                    corners=SKULL_CORNERS)], "w")
    add(wfl + wfr, "gw")
    add(wll + wlr, "k")

    tf, tl = torso()
    add([tf], "g")
    add([tl], "k")

    cf, cl, ca = collar()
    add(cf, "g")

    body_before_head = "".join(P)
    P = []

    ef, el = ears()
    add(ef, "g")
    add(ear_skin(), "w")
    add(el, "k")
    add([head_mass()], "g")
    add([face_mask()], "w")
    head_ht = (f'<g fill="{ink[pal["k"]]}">'
               + "".join(shading_head(defs, pal)) + "</g>")
    P.append(head_ht)
    add([head_line()], "k")

    ew, elines, ed, ev = eyes()
    md, ml, mt = mouth()
    add(ew, "w")
    add(md, "r")
    add(mt, "w")
    add(ev, "r")
    add(face_line() + brows() + elines + ed + ml + nose(), "k")
    head = "".join(P)
    P = []

    P.append(f'<g fill="{ink[pal["k"]]}">' + "".join(shading_body(defs)) + "</g>")
    add(chest(), "k")
    add(cl, "k")
    add(ca, "r")
    front = "".join(P)

    return defs, body_before_head, head, front


def mark_group(pal=None, ink=None, uid="", keyline=False):
    defs, back, head, front = build(pal, ink, keyline)
    # The head is cocked 6 degrees; the neck it sits on is not. That is the
    # difference between attitude and a rotated logo.
    if uid:
        defs = [d.replace('id="ht', f'id="{uid}ht') for d in defs]
        rep = lambda t: t.replace("url(#ht", f"url(#{uid}ht")
        back, head, front = rep(back), rep(head), rep(front)
    return ("<defs>" + "".join(defs) + "</defs>" + back +
            '<g transform="rotate(-6 500 706)">' + head + "</g>" +
            front)


BLACK_BLANK = "#141414"


def content_box(pad=26):
    """Bounding box of every control point in the mark, plus padding."""
    import re
    g = mark_group()
    xs, ys = [], []
    for d in re.findall(r'\sd="([^"]+)"', g):
        for a, b in re.findall(r'(-?[\d.]+),(-?[\d.]+)', d):
            xs.append(float(a))
            ys.append(float(b))
    for a, b in re.findall(r'cx="(-?[\d.]+)" cy="(-?[\d.]+)"', g):
        xs.append(float(a))
        ys.append(float(b))
    x0, x1 = min(xs) - pad, max(xs) + pad
    y0, y1 = min(ys) - pad, max(ys) + pad
    return x0, y0, x1 - x0, y1 - y0


def svg(bg=None, box=None, scale=1.0, pal=None, keyline=False, uid=""):
    x, y, w, h = box or content_box()
    rect = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="{x:.0f} {y:.0f} {w:.0f} {h:.0f}" '
            f'width="{w * scale:.0f}" height="{h * scale:.0f}">'
            f'{rect}{mark_group(pal, uid=uid, keyline=keyline)}</svg>')


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "art/mark.svg"
    open(out, "w").write(svg(bg=INK["w"]))
    print(out)
