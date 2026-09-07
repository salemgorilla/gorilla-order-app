"""Contact sheet: every size and reduction the mark has to survive."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch as F

BG = F.INK["w"]
x, y, w, h = F.content_box()
full = F.mark_group(F.FULL, uid="a")
mono = F.mark_group(F.MONO, uid="b")


def place(inner, px, py, target_w):
    k = target_w / w
    return (f'<g transform="translate({px},{py}) scale({k:.4f}) '
            f'translate({-x},{-y})">{inner}</g>')


W, H = 1680, 900
parts = [f'<rect width="{W}" height="{H}" fill="{BG}"/>']
parts.append(place(full, 40, 40, 620))
parts.append(place(mono, 700, 40, 620))
# left chest at 3.5in and the 1cm test, both reductions
for i, (inner, px) in enumerate(((full, 1360), (mono, 1360))):
    parts.append(place(inner, px, 60 + i * 300, 240))
parts.append(place(mono, 1380, 690, 96))
parts.append(place(mono, 1500, 700, 52))
parts.append(place(full, 1580, 704, 40))
open(sys.argv[1], "w").write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
    f'width="{W}" height="{H}">' + "".join(parts) + "</svg>")
