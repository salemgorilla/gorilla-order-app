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
WING_ROOT = (152, 96)
WING_W    = 14            # ink across one feather
WING_PITCH= 20            # 14 ink + 6 slit
WING_LEN  = (100, 80, 60) # 10u, 8u, 6u
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

def mark(ink, gold, small=False):
    """ink: head, wings, tail.  gold: face plate, cap, inner ear.
    small=True is the under-4-inch cut: teeth close, tassel cord thickens."""
    s = []
    w = wing_path()
    s.append(f'<g id="wings" fill="{ink}"><path d="{w}"/>'
             f'<path transform="translate(240 0) scale(-1 1)" d="{w}"/></g>')
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
    s.append(lab(168, 168, "3 FEATHERS / WING"))
    s.append(lab(168, 174, "14 INK · 6 SLIT · 30 SHOULDER"))
    return "\n".join(s)

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
         T(16, 196, "FLYING", 26, fam=DISPLAY, weight=700, ls=-0.8),
         T(16, 222, "MONKEY", 26, fam=DISPLAY, weight=700, ls=-0.8),
         T(16, 236, "AIR SERVICES™", 7, ls=0.8),
         f'<path stroke="{INK}" stroke-width="1" d="M16 246 H184"/>',
         T(16, 258, "FM-AIR-26-FF-1C", 8, weight=700),
         T(184, 258, "COMMAND 01/03", 8, anchor="end"),
         T(16, 270, "CAP GOLD ON WINKIE BLACK", 6.5),
         T(184, 270, "PLASTISOL · 156 MESH", 6.5, anchor="end"),
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
         T(96, 44, "FLYING", 24, fill=GOLD, fam=DISPLAY, weight=700, ls=-0.8),
         T(96, 68, "MONKEY", 24, fill=GOLD, fam=DISPLAY, weight=700, ls=-0.8),
         T(96, 84, PLACE, 6, fill=GOLD),
         f'<path stroke="{GOLD}" stroke-width="1" d="M200 14 V86"/>',
         T(218, 54, "L", 22, fill=GOLD, fam=DISPLAY, weight=700, anchor="middle"),
         T(218, 68, "FM-AIR", 5.5, fill=GOLD, anchor="middle"),
         ]
    return svg("\n".join(s), vb="0 0 240 100", title="Flying Monkey — woven neck label")

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
      <span><b>FLYING MONKEY™</b> · AIR SERVICES · CAP OFFICE</span><span>SHEET FM-CAP-26-SHT-2C · POST-ICONOGRAPHIC</span></div>
    <h1 style="margin-top:18px">Flying<br>Monkey</h1>
    <div class="slogan">{SLOGAN}</div>
  </div>
  <div class="specblock spec">
    <table>
      <tr><td>Issuing unit</td><td>CAP OFFICE</td></tr>
      <tr><td>Asset</td><td>MASCOT MARK · FM-01</td></tr>
      <tr><td>Edition</td><td>COMMAND 01/03</td></tr>
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
    <p style="margin-top:22px">Every curve on the mark is one of five radii. Every straight edge is horizontal, vertical, or pitched at 42.52°, the latitude of Salem. Each wing carries three feathers, one per command the Golden Cap grants its wearer. The cap sits on the crown because the fleet holds its own cap now. The tail is the only asymmetry, and it is drawn from the same two radii as the ears and eyes.</p>
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
  <div class="eyebrow spec"><span><b>06 / VOICE</b> · A BRAND TALKING ABOUT ITSELF WITH A STRAIGHT FACE</span><span>DEADPAN · IF IT WINKS, CUT IT</span></div>
  <div class="cell" style="grid-column:1/8"><div class="big">The Cap is held in-house. Requests for a fourth command are not acknowledged.</div></div>
  <div class="cell b" style="grid-column:8/13">
    <p><b>Type.</b> Display: Space Grotesk 700, all caps, tracking −4%. Standing in for Suisse Int'l; it is already the house face in the order app. Mono: JetBrains Mono for every code, dimension and coordinate, standing in for ABC Diatype Mono. Two families, no third.</p>
    <p style="margin-top:12px"><b>Provenance.</b> {PLACE}. Printed at 47 Canal Street. The latitude is in the wing; the address is on the tag.</p>
    <p style="margin-top:12px"><b>Source.</b> The Winged Monkeys, the Golden Cap and its three commands are from L. Frank Baum, <i>The Wonderful Wizard of Oz</i>, 1900, public domain. Nothing here is drawn from the 1939 film.</p>
  </div>
</div>

<div class="foot spec"><span><b>FLYING MONKEY™</b> · CAP OFFICE · FM-CAP-26-SHT-2C</span><span>{PLACE}</span><span>COMMAND 01/03</span></div>
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
    W("mark/fm-mark-construction.svg",  svg(construction(), bg=BLANK, title="Flying Monkey — construction: radius set and the 42.52° datum"))
    ht, sn, nl = hangtag(), service_notice(), neck_label()
    W("ephemera/fm-hangtag.svg", ht)
    W("ephemera/fm-service-notice.svg", sn)
    W("ephemera/fm-neck-label.svg", nl)
    strip = lambda s: s[s.index("<svg"):]
    W("sheet/fm-proof-sheet.html", sheet({"hangtag": strip(ht), "notice": strip(sn), "label": strip(nl)}))
    print("built", out)
