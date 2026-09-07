"""
ink.py — a brush, not a pen.

Every visible line in the Flying Monkey artwork is a CLOSED FILLED SHAPE with a
varying width, never an SVG stroke. That is the whole point of this module and
the constraint that keeps the mark off the clip-art pile: a stroke has one
weight, a brush has a belly.

Author a line as a centreline (a list of points) plus a width profile (pressure
along the line). This compiles it to an outline the way an inker's nib would
lay it down — swelling into a curve, lifting to nothing at the ends.

Width profiles are given in normalised arc length, so a profile authored on a
short line behaves the same when the line gets longer during revision.
"""

import math

# ---------------------------------------------------------------- geometry ---

def _v(a, b):
    return (b[0] - a[0], b[1] - a[1])


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1])


def _mul(a, s):
    return (a[0] * s, a[1] * s)


def _len(a):
    return math.hypot(a[0], a[1])


def _norm(a):
    m = _len(a)
    return (0.0, 0.0) if m < 1e-12 else (a[0] / m, a[1] / m)


def _perp(a):
    return (-a[1], a[0])


# ------------------------------------------------------------------ curves ---

def _tangents(pts, closed, corners):
    """In/out tangent per point. A corner breaks tangent continuity."""
    n = len(pts)
    tin, tout = [], []
    for i in range(n):
        p = pts[i]
        prev = pts[(i - 1) % n] if closed else pts[max(i - 1, 0)]
        nxt = pts[(i + 1) % n] if closed else pts[min(i + 1, n - 1)]
        if i in corners:
            ti = _v(prev, p)
            to = _v(p, nxt)
        else:
            ti = to = _mul(_v(prev, nxt), 0.5)
        tin.append(ti)
        tout.append(to)
    return tin, tout


def to_beziers(pts, closed=False, corners=(), smooth=1.0):
    """Catmull-Rom through `pts` -> list of cubic segments (p0, c1, c2, p3)."""
    corners = set(corners)
    if len(pts) < 2:
        return []
    tin, tout = _tangents(pts, closed, corners)
    segs = []
    last = len(pts) if closed else len(pts) - 1
    for i in range(last):
        j = (i + 1) % len(pts)
        p0, p3 = pts[i], pts[j]
        k = smooth / 3.0
        c1 = _add(p0, _mul(tout[i], k))
        c2 = _add(p3, _mul(tin[j], -k))
        segs.append((p0, c1, c2, p3))
    return segs


def _cubic_at(s, t):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = s
    u = 1 - t
    a, b, c, d = u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t
    return (a * x0 + b * x1 + c * x2 + d * x3,
            a * y0 + b * y1 + c * y2 + d * y3)


def _cubic_tan(s, t):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = s
    u = 1 - t
    a, b, c = 3 * u * u, 6 * u * t, 3 * t * t
    tx = a * (x1 - x0) + b * (x2 - x1) + c * (x3 - x2)
    ty = a * (y1 - y0) + b * (y2 - y1) + c * (y3 - y2)
    if abs(tx) < 1e-9 and abs(ty) < 1e-9:
        return _norm(_v(s[0], s[3]))
    return _norm((tx, ty))


def sample(segs, step=4.0, min_per_seg=6):
    """Walk the curve at roughly `step` units. Returns [(point, tangent)]."""
    out = []
    for si, s in enumerate(segs):
        rough = sum(_len(_v(_cubic_at(s, i / 12), _cubic_at(s, (i + 1) / 12)))
                    for i in range(12))
        n = max(min_per_seg, int(rough / step) + 1)
        last = n if si == len(segs) - 1 else n - 1
        for i in range(last + 1):
            t = i / n
            out.append((_cubic_at(s, t), _cubic_tan(s, t)))
    return out


# ------------------------------------------------------------------- width ---

def _smoothstep(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def width_at(profile, t):
    """profile: [(t, w), ...] sorted. Eased between control points."""
    if len(profile) == 1:
        return profile[0][1]
    if t <= profile[0][0]:
        return profile[0][1]
    if t >= profile[-1][0]:
        return profile[-1][1]
    for i in range(len(profile) - 1):
        t0, w0 = profile[i]
        t1, w1 = profile[i + 1]
        if t0 <= t <= t1:
            k = _smoothstep((t - t0) / (t1 - t0)) if t1 > t0 else 0.0
            return w0 + (w1 - w0) * k
    return profile[-1][1]


# The house pressure curves. A loaded brush pulled once: touch down, swell past
# the middle, lift off. TAPER is the default for every contour line.
TAPER = [(0.0, 0.00), (0.18, 0.92), (0.55, 1.00), (0.82, 0.78), (1.0, 0.00)]
TAPER_OUT = [(0.0, 1.00), (0.55, 0.95), (1.0, 0.00)]   # blunt start, lift off
TAPER_IN = [(0.0, 0.00), (0.45, 0.95), (1.0, 1.00)]    # touch down, blunt end
EVEN = [(0.0, 0.88), (0.5, 1.00), (1.0, 0.88)]         # closed contours
WEDGE = [(0.0, 1.00), (1.0, 0.06)]                     # a cut, a claw, a lash


# ----------------------------------------------------------------- outline ---

def _fmt(p):
    # 0.1 user units is 0.03mm on a 12in print — well under what any screen
    # resolves, so the extra decimal only costs file size.
    return f"{p[0]:.1f},{p[1]:.1f}"


def path_from_points(pts, closed=True, corners=(), smooth=1.0):
    segs = to_beziers(pts, closed=closed, corners=corners, smooth=smooth)
    if not segs:
        return ""
    d = [f"M{_fmt(segs[0][0])}"]
    for (_p0, c1, c2, p3) in segs:
        d.append(f"C{_fmt(c1)} {_fmt(c2)} {_fmt(p3)}")
    if closed:
        d.append("Z")
    return "".join(d)


def stroke(pts, w=10.0, profile=None, closed=False, corners=(), smooth=1.0,
           step=5.0, cap=0.0):
    """Compile a brush line to a closed filled outline path.

    w        peak width in user units
    profile  pressure curve in normalised arc length (default TAPER)
    cap      extend blunt ends by this fraction of w (rounds a stopped line)
    """
    profile = profile if profile is not None else TAPER
    segs = to_beziers(pts, closed=closed, corners=corners, smooth=smooth)
    pk = sample(segs, step=step)
    if len(pk) < 2:
        return ""

    # arc length parametrisation so the profile is geometry-true
    dists = [0.0]
    for i in range(1, len(pk)):
        dists.append(dists[-1] + _len(_v(pk[i - 1][0], pk[i][0])))
    total = dists[-1] or 1.0

    left, right = [], []
    for (p, t), d in zip(pk, dists):
        hw = width_at(profile, d / total) * w * 0.5
        n = _perp(t)
        left.append(_add(p, _mul(n, hw)))
        right.append(_add(p, _mul(n, -hw)))

    if closed:
        return (path_from_points(left, True, smooth=smooth) + " " +
                path_from_points(list(reversed(right)), True, smooth=smooth))

    # blunt ends get a small round cap so a stopped line does not read cut
    head, tail = [], []
    if cap > 0:
        w0 = width_at(profile, 0.0) * w * 0.5
        w1 = width_at(profile, 1.0) * w * 0.5
        if w0 > 0.2:
            p, t = pk[0]
            head = [_add(p, _mul(t, -w0 * cap))]
        if w1 > 0.2:
            p, t = pk[-1]
            tail = [_add(p, _mul(t, w1 * cap))]

    ring = left + tail + list(reversed(right)) + head
    cor = set()
    if not tail:
        cor.add(len(left) - 1)
    if not head:
        cor.add(len(left) + len(tail))
    return path_from_points(ring, True, corners=cor, smooth=0.85)


def blob(pts, corners=(), smooth=1.0):
    """A solid mass — pupil, tooth, wing membrane, cast shadow."""
    return path_from_points(pts, closed=True, corners=corners, smooth=smooth)


# ---------------------------------------------------------------- halftone ---

def halftone(bbox, lpi_units, angle_deg, radius_fn, clip_id):
    """A real dot grid on a real angle. Structural shading, not a filter.

    lpi_units  centre-to-centre dot spacing in user units
    radius_fn  (x, y) -> dot radius in user units; return <=0 to skip
    """
    x0, y0, x1, y1 = bbox
    a = math.radians(angle_deg)
    ca, sa = math.cos(a), math.sin(a)
    diag = math.hypot(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    n = int(diag / lpi_units) + 2
    out = []
    for iy in range(-n, n + 1):
        for ix in range(-n, n + 1):
            ux, uy = ix * lpi_units, iy * lpi_units
            x = cx + ux * ca - uy * sa
            y = cy + ux * sa + uy * ca
            if not (x0 - lpi_units <= x <= x1 + lpi_units):
                continue
            if not (y0 - lpi_units <= y <= y1 + lpi_units):
                continue
            r = radius_fn(x, y)
            if r > 0.15:
                out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}"/>')
    return f'<g clip-path="url(#{clip_id})">' + "".join(out) + "</g>"
