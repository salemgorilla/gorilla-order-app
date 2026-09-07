# FETCH — Flying Monkey mascot

**The gag, in one line: he was sent to fetch the girl and came back with a shirt.**

Register: **Aerosol.** Method: Ed Roth's weirdo-shirt logic — the one that ran
out of a booth and the back of *Car Craft* between 1958 and 1963, and put the
printed t-shirt on the map — transposed onto Essex Street rather than pasted
onto it. No flames on a witch.

Everything here is generated from source in `tools/`. Nothing was traced, and
no drawing in this folder is a photograph, a filter, or a texture pack.

---

## 1. The inversion target, named

Rat Fink (first advertised *Car Craft*, July 1963) was built as the deliberate
opposite of a corporate mascot: Roth named what he was against and inverted
every feature. Same method, different target.

**Against: the licensed winged-monkey plush.** Collared, uniformed, servile,
feather-winged, bilaterally symmetrical, sphere-headed, with a mouth smaller
than its face.

| The plush | FETCH |
|---|---|
| Collared, still on the strap | Strap broken; the D-ring hangs open with a bite out of it |
| Tidy feathered wings | Bat membrane with a drawn finger armature |
| Perfectly symmetrical | Nothing mirrors — see §4 |
| Sphere head | Wide, low, brow-heavy skull; jaw rolled under |
| Mouth inside its face | Grin wider than the muzzle can hold, one tooth gone |
| Bare-faced cartoon | Real primate face mask, printed as *no ink at all* |
| Obedient | Not going back, and looking past you while he says so |

The mascot **is** the mark. There is no separate logo, and the mark carries no
wordmark — including on the enamel pin, which is where that claim gets tested.

## 2. Separations — decided before the drawing, not after

| Code | Name | Hex | After |
|---|---|---|---|
| FM-00 | BONE | `#EFE7D6` | The natural cotton blank. A palette entry, not the absence of one. |
| FM-01 | FRIENDSHIP BLACK | `#161311` | Hull of the *Friendship of Salem*, the 1797 East Indiaman on Derby Wharf |
| FM-02 | CUSTOM HOUSE VERDIGRIS | `#5E8A7B` | The oxidised copper on the 1819 Custom House |
| FM-03 | DERBY LIGHT RED | `#D0452F` | The lantern of the 1871 Derby Wharf light |
| FM-04 | CHIPBOARD | `#C9B99A` | Uncoated hangtag stock |

Four names, four real Salem objects with dates. Not a mood board.

- **Colour count:** 3 spot on a bone blank (FM-01/02/03). The face and the
  teeth are FM-00 — *unprinted garment*. Dropping the face to a knockout is
  what keeps a four-value drawing inside three screens.
- **Ink system:** plastisol. Aerosol register, and the halftone needs the
  edge that a discharge print will not hold on a 110.
- **Mesh / halftone:** 110 mesh, **35 LPI at 22.5°**. The dot is meant to be
  visible at print size — it is the shading, not a texture over the top. 22.5°
  keeps it off the garment weave.
- **Black blank:** add a white (FM-00) **choke keyline** on the outer
  silhouette only — `art/mark-black.svg`. Without it the black contour *is*
  the garment and the mark loses its edge. That is a fourth screen; price it.
- **Accent discipline:** FM-03 appears on four things total — mouth interior,
  two collar studs, the ring, three eye vessels. Colour arrives as an event.

**Pantone and thread:** nearest book matches are **Neutral Black C** (FM-01),
**173 C** (FM-03), **5545 C** (FM-02). Confirm every one against a physical
chip under shop light before the first run — a hex is not a match. Embroidery
thread numbers are deliberately **not** listed: pull them off the Madeira
Polyneon card against the physical chip. Invented thread numbers would ruin a
run, so there are none here.

## 3. Placements

| Application | Width | From HPS |
|---|---|---|
| Full front (`art/tee-front.svg`) | 12 in | 3 in |
| Left chest, mark only | 3.5 in | 7.5 in |
| Full back, mark only | 13 in | 3.5 in |

Left chest and the 1 cm badge test are both in `render/sheet.png`. The mark
holds its silhouette down to about 40 px; below that the grin and the wing
line are the last things standing, which is the correct order.

## 4. What makes it drawn — the executable authorship moves

Design-taste principle 1 requires naming which moves were used. Three:

- **#5, a production constraint authoring the form.** The 110-mesh/35-LPI dot
  is generated as a real grid on a real angle at full ink strength — the dot
  *area* carries the tone, exactly as on the press. It is never a transparency
  and never an overlay. And the bare face is drawn by the separation itself:
  it is a colour the shop does not print.
- **#3, a named modification, applied to the whole alphabet.** The lettering
  (`tools/letters.py`) is drawn, not set. Verticals carry 38 units, horizontals
  26, diagonals 32, curves 34 — the thick/thin of a flat brush at a constant
  angle, which is what a show-card writer's hand actually does and what a
  typeface has no reason to do. Each glyph is then rotated a fraction of a
  degree and nudged off the baseline, deterministically by position, so no two
  E's in a line are the same E.
- **#2, one non-obvious constraint held everywhere.** *No path in any output
  file carries a stroke.* Every line is a closed filled outline compiled from a
  centreline plus a pressure curve (`tools/ink.py`), and every contour lifts
  toward zero width at its ends. A stroke has one weight; a brush has a belly.
  That single rule is the difference between this and clip art, and it is
  checkable: `grep -c 'stroke=' art/*.svg` returns 0.

**Nothing is mirrored.** The right wing opens 4% further and hangs 34 units
lower. The left brow is up and the right is driven down — one face doing two
things at once. The tuft is off-centre. The head is cocked 6° on a neck that
is not. Symmetry is the plush's silhouette, not ours.

**Restraint where it counts.** Four fur notches, not forty. Three eye vessels,
where Roth would draw thirty — this desk has had sixty-six more years to find
out that three does the same work. One halftone crescent on the face, on the
side turning away, because two would be symmetry again.

## 5. Naming grammar

    FM - FTCH - <placement><size> - <colours> - <year>

    FM-FTCH-FF12-3C-26     Fetch, full front 12in, 3 colour, 2026
    FM-FTCH-LC35-1C-26     left chest 3.5in, one ink
    FM-FTCH-DEC-6UP-26     decal sheet, six up
    FM-FTCH-PIN-125-26     enamel pin, 1.25in

Every segment encodes something a press operator needs. No decoration
pretending to be a code, and no ® anywhere — the mark is unregistered.

## 6. Ethos, in the shop's voice

> **Nobody here went back.**

## 7. What is in this folder

| File | What it is |
|---|---|
| `art/mark-3c.svg` | The mark. 3 spot on bone. |
| `art/mark-1c.svg` | One ink. Fur drops to a dot field, wings take solid black, teeth stay a knockout. |
| `art/mark-black.svg` | Black blank, with the FM-00 choke keyline. |
| `art/tee-front.svg` | Full front, 12 in. One gag, caption lettered in. |
| `art/flyer.svg` | The mail-order card, 5.5 × 8.5. Dense, lettered, price in the art, coupon on the bottom edge. |
| `art/decal-sheet.svg` | Six up, 5 × 7, kiss-cut. |
| `art/pin.svg` | 1.25 in hard enamel. No wordmark — the test. |
| `art/hangtag.svg` | 2 × 3.5 on chipboard, one ink. |
| `tools/ink.py` | The brush: centreline + pressure curve → closed filled outline. Also the halftone generator. |
| `tools/letters.py` | The drawn alphabet. |
| `tools/fetch.py` | The mascot. |
| `tools/compose.py` | The applications. |
| `tools/render.sh` | SVG → PNG proofs. |

Rebuild everything: `python3 tools/fetch.py art/mark-3c.svg && python3 tools/compose.py`

## 8. Open decisions — not mine to make

- **The prices on the flyer are placeholders** (`$28 / $6 / $12`). They are set
  in `tools/compose.py`; change them there before anything goes to print.
- **Pantone and thread** need physical confirmation (§2).
- **The full-back figure is not drawn.** The badge is the mark and it is
  finished; the obvious next piece is Fetch full-body, mid-flight, one fist
  round a printed shirt, at 13 in on the back — the moment the caption
  describes. That is a second drawing, not a scale of this one.
- **The storefront is the show car.** Roth's Outlaw and Beatnik Bandit existed
  to sell the shirts. 196 Essex Street is the equivalent artifact and the
  window is its billboard; a window decal at 24 in is the cheapest version of
  that idea and it is not in this folder yet.

---

## Self-review

    REGISTER: Aerosol
    VERDICT:  Ships

    HARD FAILS
    - none

    CONTEXT FAILS
    - none

    NOTES
    - The wing tips are the weakest passage: sharp, and they thin out fastest
      at badge size. They survive because the solid-black reduction gives them
      mass, which is a reduction rescuing a shape rather than the shape being
      right in both. Worth redrawing if it ever gets an edition 2.
    - Three of the four palette entries do real work; FM-04 CHIPBOARD only
      appears on the hangtag. That is a stock, honestly named, not a fourth
      ink — but it is the one entry that does not earn its place in the system.
    - The flyer's price column is the only element in the folder pointing at a
      value nobody has set yet.

    THE ONE THING
    Draw the full-body figure — the caption promises a shirt in his fist and
    the badge cannot show it.

**Would this survive at a car-show booth next to a real Roth reprint?**
Yes — because it is not doing a Roth impression. It is doing what Roth did:
name the mascot you are against, invert it feature by feature, let the press
decide the drawing, and letter the caption by hand. The one thing on the table
that would give it away as new is how much has been left out.
