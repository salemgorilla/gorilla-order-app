# Flying Monkey — mascot mark

A winged monkey skull in a pillbox cap, built from five radii and one angle, for a
streetwear brand that talks about itself like an air-freight company. The horror is
carried by the stare and the teeth; everything else is the system.

**Edition 02** takes the WipEout move literally: each wing is a 7-segment **3**
sheared to Salem's latitude, and the wordmark and readout are drawn in a segment
alphabet whose every diagonal is that same angle. See *The bounce* below for what
was taken from current work and what was refused.

Register: **Republic.** Era: **post-iconographic** — the mark and the owned colour
do the work; type is spec furniture.

![mark](mark/fm-mark-2c.png)

## References (principle taken, not the form)

- **WipEout team badges** — the mark encodes a datum and lives inside a fictional
  corporate ecosystem with its own units and codes.
- **Pho-Ku Corporation** — a faux conglomerate written with a straight face. The
  slogan and disclaimer are corporate handbook, not jokes.
- **Warp** — one owned hue applied everywhere. Here that is Cap Gold.

## The institution

| | |
|---|---|
| Parent | **FLYING MONKEY™** · Salem, Massachusetts |
| Units | **AIR SERVICES** (tees, hoods) · **GROUND CREW** (headwear, bags) · **CAP OFFICE** (print, ephemera, editions) |
| Edition language | **COMMAND 01/03** — three releases per owner, per the Golden Cap |
| Slogan | THREE COMMANDS PER OWNER. |
| Disclaimer furniture | The Cap is held in-house. Requests for a fourth command are not acknowledged. |
| Provenance | SALEM MA · 42.52°N 70.90°W · printed at 47 Canal Street |

Source: the Winged Monkeys, the Golden Cap and its three-command limit are from
L. Frank Baum, *The Wonderful Wizard of Oz* (1900), public domain. Nothing is
taken from the 1939 film, and no character names from it are used.

### Code grammar — every field is a real value

`FM-AIR-26-FF-1C`

| Field | Values | Meaning |
|---|---|---|
| `FM` | | Flying Monkey |
| unit | `AIR` `GND` `CAP` | Air Services · Ground Crew · Cap Office |
| year | `26` | year of issue |
| placement / format | `FF` `LC` `FB` `SL` `TAG` `STK` `LBL` `SHT` | full front · left chest · full back · sleeve · hangtag · sticker · label · sheet |
| inks | `1C` `2C` | ink count on press |

## The mark and its datum

Authorship moves used (design-taste, principle 1): **#1 datum**, **#2 held
constraint**, **#5 production constraint**.

- **Datum.** Every straight edge is horizontal, vertical, or pitched at **42.52°** —
  Salem's latitude. The wing's leading edge is the angle.
- **Constraint set.** Every curve is a circular arc with radius in
  **{5, 10, 20, 30, 60}** on a 24-unit grid (240 viewBox). `build.py` asserts this
  and refuses any other radius.
- **Three feathers per wing** — one per command the Golden Cap grants. In Edition 02
  the three feathers are equal (3 × 84) on one 30-unit spine, so each wing is a
  7-segment **3** sheared to 42.52°. Rotate the wing flat and it reads as the digit.
- **The cap on the crown** — the fleet holds its own cap now. Tassel cord hangs at
  the datum angle, the only element in motion.
- **The tail** is the single asymmetry, drawn from the same R20/R10 as ears and eyes.
- **Production constraint.** Designed for one-colour plastisol on 156 mesh, no
  halftone. Below 4 in the teeth close and the tassel cord thickens from 3 to 4
  units (`*-sm.svg`). Minimum feature at left chest 3.5 in is the 6-unit wing
  slit, 2.2 mm.

## Type

- **The segment alphabet (drawn).** Wordmark, readout, unit names, the departure
  board, labels. One grammar: a 12 × 11 cell, stroke 2, edges at 0° / 90°, and every
  diagonal at 42.52°. The cell is wider than tall because atan(11/12) = 42.51°: the
  face is extended because the datum makes it extended. K, M, N, R, V, X, Y and the
  prime marks carry the angle. WipEout built its wordmark from partial 7-segment
  8s; this is the same trick with a different number in it. Display only, never
  below 7 units cap height. Authorship move #3.
- **The readout.** `42°31′12″N` is 42.52° written as degrees, minutes, seconds, the
  way WipEout wrote lap times with ′ ″. It is the wing angle spelled out.
- Copy: **Space Grotesk 700**, all caps, tracking −4%. Standing in for Suisse
  Int'l — it is already the house face in the order app.
- Mono: **JetBrains Mono** for every code, dimension and coordinate. Standing in for
  ABC Diatype Mono.
- One drawn face, two families. No third.

## Inks

| Ink | Pantone | Screen | Carries |
|---|---|---|---|
| **Winkie Black** | Black C | `#111111` | head, wings, tail, type |
| **Cap Gold** | 7406 C | `#F1C400` | face plate, cap, inner ear — the owned hue |
| **Kansas** (blank, not an ink) | — | `#F4F1EA` | natural / heather garment, card stock |

Thread references for embroidery are matched at digitizing against Black C and
7406 C. None are invented here.

## The bounce — tDR against what is winning now

What Edition 02 took from current work, and what it refused. Every "taken" is a
system move; every "refused" is a styling move.

| Now | Taken | Refused |
|---|---|---|
| **Mascots are back and character IP is the asset** (the 2026 branding story) | The head is built to be an object first and a print second: `fm-head-*.svg` | Warmth. The stare stays. |
| **Collectible mascots** (Pop Mart's Labubu; Bearbrick before it) win on a silhouette that survives as a 1.25 in pin and a 6 in vinyl | Head-only cut, pin card `FM-GND-26-PIN-2C` | The blind box. Three commands a year is the only scarcity mechanic. |
| **Deadpan corporate horror** (Liquid Death; Duolingo's dead owl) proves macabre and institutional can be the same voice | The departure board `FM-CAP-26-PST-1C` and the Cap Office voice | The wink. Nothing on the board is a joke; row 04 is a rule. |
| **Guerrilla scarcity** (Corteiz: one mark, quotable rules) is a system, not a style | One mark everywhere, one owned colour, a rule you can quote | A colourway per unit. WipEout gave each team a colour; Flying Monkey is one team. |
| **The WipEout revival** (30 years, Sept 2025; *WipEout Futurism*, Thames & Hudson) means the look is being mined as a filter | The encoding trick only: the wing is a digit, the readout is a lap time, the alphabet's diagonal is the latitude | Katakana, fake sponsors, chrome, gradients. |
| **Salem** already has a mascot: the witch | Flying Monkey is the contractor that flies for it. Real latitude, real address, public-domain book | 1692. It stays out of the mark on purpose. |

## Files

```
mark/
  fm-mark-2c.svg            two inks, for Kansas / white / light grounds
  fm-mark-1c-black.svg      one ink, face knocked out to the blank
  fm-mark-1c-gold.svg       one ink Cap Gold — the production default on black
  fm-mark-1c-black-sm.svg   under-4-inch cut (teeth closed, cord 4u)
  fm-mark-1c-gold-sm.svg    under-4-inch cut, Cap Gold
  fm-mark-construction.svg  the radius set and the 42.52° callout
  fm-head-2c.svg            head only, two inks — pins, figures, plush
  fm-head-1c-gold.svg       head only, Cap Gold on black
  fm-wordmark.svg           FLYING / MONKEY in the segment alphabet
  fm-readout.svg            42°31′12″N
  fm-mark-2c.png            1200 px preview
ephemera/
  fm-hangtag.svg            2 × 3.5 in, 1C black on Kansas board       FM-CAP-26-TAG-1C
  fm-service-notice.svg     3 in round, 1C gold on black vinyl         FM-CAP-26-STK-1C
  fm-neck-label.svg         60 × 25 mm woven, gold weft on black       FM-AIR-26-LBL-1C
  fm-departure-board.svg    18 × 24 in poster, 1C gold on black        FM-CAP-26-PST-1C
  fm-pin-card.svg           3 × 4 in backing card, head only, 2C       FM-GND-26-PIN-2C
sheet/
  fm-proof-sheet.html       the system on one page (loads Space Grotesk / JetBrains Mono from Google Fonts)
  fm-proof-sheet.png        rendered, 1600 × 5330
build.py                    regenerates everything: python3 build.py .
```

Standard placements: full front 12 in wide, 2.5 in from HPS. Left chest 3.5 in,
7.5 in from HPS, `-sm` cut. Sleeve 3 in, `-sm` cut.

## Review

```
REGISTER: Republic
VERDICT: Ships

HARD FAILS
- none

CONTEXT FAILS
- none

NOTES
- Edition 02 closes the Edition 01 note: the wordmark is now drawn, from the same
  angle as the mark.
- K is 8 units wide, not 12, because its arms must hold 42.52°. Stated, not hidden.
- Thread refs deliberately left to digitizing rather than invented.
- The tee silhouettes on the sheet are mockup furniture, not brand assets.

THE ONE THING
Print the 1C gold on a black blank at 12 in before anything else — the mark was
designed for that separation and it is the one that has to be right.

Is this tDR or a tDR filter?  Strip the styling and the concept survives: a
brand that is an air service with a three-command limit, a mark whose wing is a
digit at a latitude, a face whose diagonal is the same latitude, codes that decode
to press facts, a board that publishes the rule. tDR.
```
