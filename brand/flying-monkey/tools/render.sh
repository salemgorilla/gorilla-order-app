#!/usr/bin/env bash
# Render an SVG to PNG with headless Chromium, fitted inside a box.
#
# Two quirks of this headless build are handled here. The screenshot comes back
# the size of --window-size, but the live viewport is about 88px shorter than
# that, so artwork drawn to the requested height silently loses its last 88px
# to page background. The window is therefore asked for extra height, and the
# strip lands below the art rather than through it. Nothing is scaled to fit
# afterwards, so measurements taken off a render are true.
#
# Usage: render.sh input.svg output.png [maxW=1400] [maxH=980] [bg=#fff]
set -euo pipefail
SVG="$(realpath "$1")"; OUT="$(realpath -m "$2")"
MW="${3:-1400}"; MH="${4:-980}"; BG="${5:-#ffffff}"
TMP="$(mktemp -d)"
DIMS=$(python3 - "$SVG" "$MW" "$MH" "$TMP/page.html" "$BG" <<'PY'
import re, sys
svg_path, mw, mh, out, bg = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4], sys.argv[5]
s = open(svg_path).read()
m = re.search(r'viewBox="\s*([-\d.eE]+)[ ,]+([-\d.eE]+)[ ,]+([-\d.eE]+)[ ,]+([-\d.eE]+)', s)
vw, vh = float(m.group(3)), float(m.group(4))
k = min(mw / vw, mh / vh)
w, h = int(round(vw * k)), int(round(vh * k))
s = re.sub(r'\s(width|height)="[^"]*"', '', s, count=2)
s = s.replace('<svg ', f'<svg width="{w}" height="{h}" ', 1)
open(out, 'w').write(
    '<!doctype html><meta charset="utf-8">'
    f'<style>html,body{{margin:0;padding:0;background:{bg};}}'
    f'svg{{display:block;width:{w}px;height:{h}px;}}</style>' + s)
print(w, h)
PY
)
W=$(echo "$DIMS" | cut -d' ' -f1); H=$(echo "$DIMS" | cut -d' ' -f2)
/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=1 \
  --window-size="${W},$((H + 96))" --screenshot="$OUT" \
  "file://$TMP/page.html" >/dev/null 2>&1
rm -rf "$TMP"
echo "$OUT  art ${W}x${H}"
