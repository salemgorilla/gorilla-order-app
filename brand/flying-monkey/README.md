# Flying Monkey — mascot mark

A winged monkey skull in a pillbox cap, built from five radii and one angle, for a
streetwear brand that talks about itself like an air-freight company. The horror is
carried by the stare and the teeth; everything else is the system.

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
- **Three feathers per wing** — one per command the Golden Cap grants.
- **The cap on the crown** — the fleet holds its own cap now. Tassel cord hangs at
  the datum angle, the only element in motion.
- **The tail** is the single asymmetry, drawn from the same R20/R10 as ears and eyes.
- **Production constraint.** Designed for one-colour plastisol on 156 mesh, no
  halftone. Below 4 in the teeth close and the tassel cord thickens from 3 to 4
  units (`*-sm.svg`). Minimum feature at left chest 3.5 in is the 6-unit wing
  slit, 2.2 mm.

## Type

- Display: **Space Grotesk 700**, all caps, tracking −4%. Standing in for Suisse
  Int'l — it is already the house face in the order app.
- Mono: **JetBrains Mono** for every code, dimension and coordinate. Standing in for
  ABC Diatype Mono.
- Two families. No third.

## Inks

| Ink | Pantone | Screen | Carries |
|---|---|---|---|
| **Winkie Black** | Black C | `#111111` | head, wings, tail, type |
| **Cap Gold** | 7406 C | `#F1C400` | face plate, cap, inner ear — the owned hue |
| **Kansas** (blank, not an ink) | — | `#F4F1EA` | natural / heather garment, card stock |

Thread references for embroidery are matched at digitizing against Black C and
7406 C. None are invented here.

## Files

```
mark/
  fm-mark-2c.svg            two inks, for Kansas / white / light grounds
  fm-mark-1c-black.svg      one ink, face knocked out to the blank
  fm-mark-1c-gold.svg       one ink Cap Gold — the production default on black
  fm-mark-1c-black-sm.svg   under-4-inch cut (teeth closed, cord 4u)
  fm-mark-1c-gold-sm.svg    under-4-inch cut, Cap Gold
  fm-mark-construction.svg  the radius set and the 42.52° callout
  fm-mark-2c.png            1200 px preview
ephemera/
  fm-hangtag.svg            2 × 3.5 in, 1C black on Kansas board       FM-CAP-26-TAG-1C
  fm-service-notice.svg     3 in round, 1C gold on black vinyl         FM-CAP-26-STK-1C
  fm-neck-label.svg         60 × 25 mm woven, gold weft on black       FM-AIR-26-LBL-1C
sheet/
  fm-proof-sheet.html       the system on one page (loads Space Grotesk / JetBrains Mono from Google Fonts)
  fm-proof-sheet.png        rendered, 1600 × 3870
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
- The wordmark is set type, not a drawn letterform. Authorship lives in the mark;
  a drawn Y ligature is the next edition if the wordmark needs to stand alone.
- Thread refs deliberately left to digitizing rather than invented.
- The tee silhouettes on the sheet are mockup furniture, not brand assets.

THE ONE THING
Print the 1C gold on a black blank at 12 in before anything else — the mark was
designed for that separation and it is the one that has to be right.

Is this tDR or a tDR filter?  Strip the styling and the concept survives: a
brand that is an air service with a three-command limit, a mark whose wing is a
latitude, codes that decode to press facts. tDR.
```
