#!/usr/bin/env python3
"""
extract_plan.py — CV + OCR floor plan extractor (no AI required)

Pipeline:
  image → preprocess → HoughLinesP (walls) → merge collinear segments
        → node extraction (intersections + endpoints, snapped)
        → room detection (flood-fill enclosed regions)
        → Tesseract OCR (room labels)
        → scale estimation (OCR dimensions or heuristic)
        → JSON output (schema-compatible with 3D Floor Plan viewer)

Usage:
  python3 tools/cv/extract_plan.py <image_path>        # prints JSON to stdout
  python3 tools/cv/extract_plan.py <image_path> <out>  # saves to file

Deps: opencv-python, pytesseract, numpy, Pillow (all pre-installed)
"""

import sys
import json
import math
import re
import tempfile
from pathlib import Path

import cv2
import numpy as np

try:
    import pytesseract
    HAS_OCR = True
except ImportError:
    HAS_OCR = False

# ─── tuning constants ──────────────────────────────────────────────────────────

MIN_WALL_PX      = 25    # px — ignore line segments shorter than this
MERGE_ANGLE_TOL  = 6     # degrees — lines within this are treated as same direction
MERGE_DIST_TOL   = 14    # px — parallel lines within this perpendicular dist are merged
NODE_SNAP_PX     = 10    # px — nodes within this radius are merged
MIN_ROOM_AREA_M2 = 2.5   # m²  — discard rooms smaller than this (furniture cavities)
MAX_ROOM_AREA_M2 = 200   # m²  — discard regions larger than this (exterior leaks)
MIN_ROOM_AREA_PX = 800   # px² — absolute floor (for very small ppm images)
MAX_ROOM_FRAC    = 0.65  # fraction of image area — rooms larger than this are exterior
MIN_ROOM_DIM_M   = 0.8   # m   — minimum room width/height (filters narrow furniture gaps)
WALL_H           = 3.0   # metres — default ceiling height
OUTER_THICK      = 0.25  # metres — load-bearing / outer wall
INNER_THICK      = 0.15  # metres — partition wall threshold in metres
PARTITION_LEN_M  = 2.0   # walls shorter than this are treated as partitions

# Furniture removal
FURNITURE_MAX_BBOX_M2  = 6.0   # connected components with bbox ≤ this MAY be furniture
FURNITURE_HOLLOW_RATIO = 0.40  # white_px / bbox_area below this → hollow frame (furniture)
FURNITURE_MIN_KEEP_FRAC= 0.03  # always keep components > 3% of the dominant wall network
ROOM_WALL_MIN_M        = 0.9   # skip segments shorter than this when rendering room canvas

ROOM_SYNONYMS = {
    'master': 'Master Bedroom', 'mbr': 'Master Bedroom',
    'bed':    'Bedroom',        'bedroom': 'Bedroom',
    'living': 'Living Room',    'lounge': 'Living Room',   'hall': 'Living Room',
    'dining': 'Dining Room',    'dining room': 'Dining Room',
    'kitchen':'Kitchen',        'kitch': 'Kitchen',
    'bath':   'Bathroom',       'wc': 'Bathroom',          'toilet': 'Bathroom',
    'corridor':'Corridor',      'passage': 'Corridor',     'foyer': 'Foyer',
    'balcony':'Balcony',        'terrace': 'Balcony',
    'store':  'Store Room',     'storage': 'Store Room',
    'utility':'Utility',        'laundry': 'Utility',
    'puja':   'Puja Room',      'prayer': 'Puja Room',
    'garage': 'Garage',
    'study':  'Study',          'office': 'Drawing / Office', 'drawing': 'Drawing / Office',
    'guest':  'Guest Room',
    'sitout': 'Sitout',         'sit out': 'Sitout',
    'parking':'Parking',        'car park': 'Parking',
    'garden': 'Garden',         'lawn': 'Garden',
    'backyard':'Backyard',      'back yard': 'Backyard',
    'wash':   'Wash Area',      'utility': 'Utility',
    'verand': 'Verandah',       'porch': 'Porch',
    'terrace':'Terrace',        'roof': 'Terrace',
    'stair':  'Staircase',      'steps': 'Staircase',
    'lift':   'Lift',           'elevator': 'Lift',
}

# ─── 1. load + preprocess ──────────────────────────────────────────────────────

def load_and_preprocess(path: str):
    img = cv2.imread(str(path))
    if img is None:
        raise ValueError(f"Cannot read image: {path}")

    # Normalise resolution — work at ≤1500px on longest side
    h, w = img.shape[:2]
    scale = min(1.0, 1500 / max(h, w))
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)),
                         interpolation=cv2.INTER_AREA)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Light denoise
    blur = cv2.GaussianBlur(gray, (3, 3), 0)

    # Otsu binarise → walls white (255), background black (0)
    _, binary = cv2.threshold(blur, 0, 255,
                               cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Most floor plans are dark lines on white paper.
    # If the dominant colour is white, invert so walls become white.
    if np.mean(binary) > 127:
        binary = cv2.bitwise_not(binary)

    # Morphological close — seal tiny gaps in wall lines
    kernel3 = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel3, iterations=1)

    return img, gray, binary, scale


# ─── 1b. furniture / annotation removal ──────────────────────────────────────
#
# Floor plans contain furniture outlines (beds, sofas, chairs, dining sets,
# cars) drawn as thin closed rectangles.  In the binary image these appear as
# isolated white-pixel loops separate from—or only barely touching—the
# structural wall network.
#
# Approach
# --------
# 1. Find connected components of white pixels.
# 2. The structural wall network is the dominant component (largest total area).
# 3. Any component that is:
#      (a) smaller than FURNITURE_MIN_KEEP_FRAC × largest_area  AND
#      (b) has a low fill-ratio (white_px / bbox_area < FURNITURE_HOLLOW_RATIO)
#          indicating a hollow rectangle, not a solid filled region  AND
#      (c) whose bounding-box in metres is below FURNITURE_MAX_BBOX_M2
#    is classified as furniture/annotation and erased from the binary.
#
# This removes freestanding furniture (dining tables, sofas, cars in parking).
# Furniture pushed against a wall (bed against bedroom wall) may share pixels
# with the main network; those are handled by the segment-length filter in the
# room-detection canvas rendering.

def remove_furniture_components(binary: np.ndarray, ppm: float) -> np.ndarray:
    """
    Erase white-pixel connected components that look like furniture outlines
    or annotation artefacts (hollow thin-loop rectangles with small bounding boxes).

    Returns a cleaned copy of the binary image.
    """
    n, labels, stats, _ = cv2.connectedComponentsWithStats(binary)
    if n <= 2:          # only background + one component → nothing to remove
        return binary

    # Component 0 is always background; skip it.
    comp_areas = [stats[i, cv2.CC_STAT_AREA] for i in range(1, n)]
    max_area   = max(comp_areas) if comp_areas else 1

    cleaned = binary.copy()
    for i in range(1, n):
        area      = int(stats[i, cv2.CC_STAT_AREA])
        bw        = int(stats[i, cv2.CC_STAT_WIDTH])
        bh        = int(stats[i, cv2.CC_STAT_HEIGHT])
        bbox_area = max(bw * bh, 1)

        # Always keep the dominant structural wall network (and any near-equal component)
        if area >= max_area * FURNITURE_MIN_KEEP_FRAC:
            continue

        fill_ratio = area / bbox_area
        bbox_m2    = bbox_area / (ppm ** 2)

        # Hollow frame + small enough bounding box → furniture
        if fill_ratio < FURNITURE_HOLLOW_RATIO and bbox_m2 < FURNITURE_MAX_BBOX_M2:
            cleaned[labels == i] = 0

    return cleaned


# ─── 2. wall-line detection ────────────────────────────────────────────────────

def detect_raw_lines(binary) -> list:
    """Return raw HoughLinesP segments as list of (x1,y1,x2,y2).
    Two passes: long structural walls first, then shorter internal walls.
    """
    all_segs = []
    for min_len, gap in [(60, 12), (25, 6)]:
        lines = cv2.HoughLinesP(
            binary,
            rho=1, theta=np.pi / 180,
            threshold=35,
            minLineLength=min_len,
            maxLineGap=gap,
        )
        if lines is not None:
            all_segs.extend(tuple(int(v) for v in l[0]) for l in lines)

    # Filter pure-diagonal segments (likely furniture/hatching).
    # Keep only lines that are within 20° of horizontal or vertical.
    def is_structural(x1, y1, x2, y2):
        a = _angle(x1, y1, x2, y2) % 90   # fold into 0–90
        return a <= 20 or a >= 70           # near-horiz or near-vert

    return [s for s in all_segs if is_structural(*s)]


# ─── 3. merge collinear segments ──────────────────────────────────────────────

def _angle(x1, y1, x2, y2) -> float:
    """Angle in [0, 180)."""
    return math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180


def _length(x1, y1, x2, y2) -> float:
    return math.hypot(x2 - x1, y2 - y1)


def _perp_dist(px, py, x1, y1, x2, y2) -> float:
    """Perpendicular distance from (px,py) to the infinite line through the segment."""
    dx, dy = x2 - x1, y2 - y1
    denom = math.hypot(dx, dy)
    if denom < 1e-9:
        return math.hypot(px - x1, py - y1)
    return abs(dy * px - dx * py + x2 * y1 - y2 * x1) / denom


def merge_segments(segs: list) -> list:
    """
    Group segments with similar angle + small perpendicular gap,
    then merge each group into one long segment.
    """
    if not segs:
        return []

    used = [False] * len(segs)
    merged = []

    for i, s in enumerate(segs):
        if used[i]:
            continue
        ai = _angle(*s)
        group = [s]
        used[i] = True

        for j, t in enumerate(segs):
            if used[j]:
                continue
            aj = _angle(*t)
            da = min(abs(ai - aj), 180 - abs(ai - aj))
            if da > MERGE_ANGLE_TOL:
                continue
            # perpendicular distance of t's midpoint from s's line
            mx, my = (t[0] + t[2]) / 2, (t[1] + t[3]) / 2
            d = _perp_dist(mx, my, s[0], s[1], s[2], s[3])
            if d > MERGE_DIST_TOL:
                continue
            group.append(t)
            used[j] = True

        # Project all group endpoints onto primary axis and span them
        ang_rad = math.radians(ai)
        dx, dy = math.cos(ang_rad), math.sin(ang_rad)
        all_pts = [(x, y) for seg in group for x, y in [(seg[0], seg[1]), (seg[2], seg[3])]]
        projs = [p[0] * dx + p[1] * dy for p in all_pts]
        imin, imax = int(np.argmin(projs)), int(np.argmax(projs))

        merged.append((
            int(all_pts[imin][0]), int(all_pts[imin][1]),
            int(all_pts[imax][0]), int(all_pts[imax][1]),
        ))

    # Filter segments that collapsed to zero length
    return [s for s in merged if _length(*s) >= MIN_WALL_PX * 0.6]


# ─── 4. node extraction ────────────────────────────────────────────────────────

def _seg_intersection(s1, s2):
    """Intersection of two infinite lines; None if parallel or out of near-range."""
    x1, y1, x2, y2 = s1
    x3, y3, x4, y4 = s2
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-6:
        return None
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    x = x1 + t * (x2 - x1)
    y = y1 + t * (y2 - y1)

    # Allow slight extension beyond endpoints (corners not perfectly meeting)
    def near(v, a, b, ext=0.20):
        lo, hi = min(a, b), max(a, b)
        span = (hi - lo) * ext + NODE_SNAP_PX
        return lo - span <= v <= hi + span

    if (near(x, x1, x2) and near(y, y1, y2) and
            near(x, x3, x4) and near(y, y3, y4)):
        return (float(x), float(y))
    return None


def _snap_dedup(pts: list, snap: float) -> list:
    """Merge points within `snap` pixels of each other (greedy)."""
    out = []
    for p in pts:
        if not any(math.hypot(p[0] - q[0], p[1] - q[1]) < snap for q in out):
            out.append(p)
    return out


def build_nodes(segs: list) -> list:
    """Return list of (x, y) node positions (deduplicated)."""
    candidates = []
    for x1, y1, x2, y2 in segs:
        candidates.append((float(x1), float(y1)))
        candidates.append((float(x2), float(y2)))
    for i, s1 in enumerate(segs):
        for j, s2 in enumerate(segs):
            if j <= i:
                continue
            pt = _seg_intersection(s1, s2)
            if pt:
                candidates.append(pt)
    return _snap_dedup(candidates, NODE_SNAP_PX)


def nearest_node(x, y, nodes, max_d=None) -> int:
    """Index of nearest node, or -1 if none within max_d."""
    if max_d is None:
        max_d = NODE_SNAP_PX * 3
    best, best_d = -1, max_d
    for i, (nx, ny) in enumerate(nodes):
        d = math.hypot(x - nx, y - ny)
        if d < best_d:
            best_d, best = d, i
    return best


# ─── 5. scale estimation ──────────────────────────────────────────────────────

def _feet_inches_to_m(text: str):
    """
    Parse the most common dimension from an OCR string containing
    feet-inches notation e.g. "13'1\"", "50'", "16'5\"".
    Returns the value in metres, or None.
    """
    # Pattern: digits ' digits " or digits '
    matches = re.findall(r"(\d+)'\s*(?:(\d+)\")?", text)
    values = []
    for ft, ins in matches:
        metres = int(ft) * 0.3048 + (int(ins) if ins else 0) * 0.0254
        if 0.5 < metres < 30:   # plausible room/building dimension
            values.append(metres)
    return values


def estimate_ppm(gray, img_w: int, img_h: int) -> float:
    """
    Pixels-per-metre.  Tries OCR first (metric AND feet/inches), falls back to 12 m.
    """
    if HAS_OCR:
        try:
            text = pytesseract.image_to_string(gray, config='--psm 11')

            # ── feet/inches labels (common in Indian/US plans) ──────────
            ft_vals = _feet_inches_to_m(text)
            if ft_vals:
                # The overall plan width dimension tends to be among the larger values
                ft_vals.sort(reverse=True)
                largest = ft_vals[0]
                ppm = (img_w * 0.75) / largest
                if 15 < ppm < 600:
                    return ppm

            # ── metric labels: "3.5m", "3 m" ────────────────────────────
            m = re.findall(r'(\d+\.?\d*)\s*m\b', text, re.IGNORECASE)
            if m:
                val = float(m[0])
                ppm = (img_w * 0.28) / val
                if 15 < ppm < 600:
                    return ppm

            mm = re.findall(r'\b(\d{3,5})\b', text)
            if mm:
                vals = sorted(int(v) for v in mm)
                mid = vals[len(vals) // 2]
                if 800 < mid < 12000:
                    ppm = (img_w * 0.28) / (mid / 1000)
                    if 15 < ppm < 600:
                        return ppm
        except Exception:
            pass

    # heuristic: total plan width ≈ 12 m (typical 3BHK apartment)
    return img_w / 12.0


# ─── 6. room detection — synthetic canvas approach ────────────────────────────
#
# Instead of flood-filling the raw binary image (which fails when furniture /
# hatching / door-gaps connect interior to exterior), we:
#   1. Render the DETECTED wall segments onto a clean black canvas
#   2. Thicken them to seal corners and tiny gaps
#   3. Flood-fill enclosed white regions = rooms
#
# This is robust against noise in the source image because only segments that
# survived the structural-line filter are drawn.

def _render_walls_canvas(segs: list, h: int, w: int, wall_px: int = 6,
                          min_len_m: float = 0.0, ppm: float = 1.0) -> np.ndarray:
    """Draw merged wall segments (white) on a black canvas.

    Segments shorter than *min_len_m* (metres) are skipped — this prevents
    short furniture-frame edges from sealing small false-room enclosures on the
    synthetic canvas used by detect_rooms().
    """
    canvas = np.zeros((h, w), dtype=np.uint8)
    for x1, y1, x2, y2 in segs:
        if min_len_m > 0 and _length(x1, y1, x2, y2) < min_len_m * ppm:
            continue
        cv2.line(canvas, (int(x1), int(y1)), (int(x2), int(y2)), 255, wall_px)
    return canvas


def detect_rooms(binary, ppm: float, segs: list = None) -> list:
    """
    Detect room regions.
    Uses synthetic canvas (from wall segments) when segs are provided,
    falling back to raw binary when not.
    """
    h, w = binary.shape

    if segs:
        # --- preferred path: synthetic clean canvas ---
        wall_px = max(6, int(ppm * OUTER_THICK))   # wall thickness in pixels
        # min_len_m skips segments shorter than ROOM_WALL_MIN_M so that bed-frame
        # and chair-back edges (0.4–0.9 m) don't form false enclosures.
        canvas  = _render_walls_canvas(segs, h, w, wall_px,
                                       min_len_m=ROOM_WALL_MIN_M, ppm=ppm)
        # Close small gaps at corners
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (wall_px, wall_px))
        sealed  = cv2.dilate(canvas, k, iterations=1)
    else:
        # --- fallback: thicken original binary ---
        k5 = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        sealed = cv2.dilate(binary, k5, iterations=2)

    # Room regions = enclosed white space (background = black)
    inv = cv2.bitwise_not(sealed)

    # Remove exterior: flood-fill from image border inward
    border_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
    cv2.floodFill(inv, border_mask, (0, 0), 0)

    # Label connected components
    n, labels, stats, centroids = cv2.connectedComponentsWithStats(inv)

    total_px = h * w
    rooms = []
    for i in range(1, n):
        area_px  = int(stats[i, cv2.CC_STAT_AREA])
        area_m2  = area_px / (ppm ** 2)
        if area_px < MIN_ROOM_AREA_PX:
            continue
        if area_m2 < MIN_ROOM_AREA_M2:
            continue
        if area_m2 > MAX_ROOM_AREA_M2:
            continue
        if area_px > total_px * MAX_ROOM_FRAC:
            continue
        # Reject enclosures that are too narrow in either dimension
        # (furniture gaps, corridor slivers, bed-frame interiors)
        box_w_m = stats[i, cv2.CC_STAT_WIDTH]  / ppm
        box_h_m = stats[i, cv2.CC_STAT_HEIGHT] / ppm
        if box_w_m < MIN_ROOM_DIM_M or box_h_m < MIN_ROOM_DIM_M:
            continue

        mask = ((labels == i).astype(np.uint8) * 255)
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        cnt   = max(cnts, key=cv2.contourArea)
        peri  = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.025 * peri, True)

        rooms.append({
            'centroid_px': (float(centroids[i][0]), float(centroids[i][1])),
            'area_m2': area_px / (ppm ** 2),
            'contour': [(int(p[0][0]), int(p[0][1])) for p in approx],
            'bbox': (
                int(stats[i, cv2.CC_STAT_LEFT]),
                int(stats[i, cv2.CC_STAT_TOP]),
                int(stats[i, cv2.CC_STAT_WIDTH]),
                int(stats[i, cv2.CC_STAT_HEIGHT]),
            ),
        })

    return rooms


# ─── 6b. door + window detection ─────────────────────────────────────────────

def detect_openings(binary, segs: list, nodes: list, ppm: float) -> list:
    """
    Detect doors (quarter-circle arcs) and windows (parallel-line triplets).

    Doors:
      HoughCircles on the binary image.  Each circle whose radius falls in the
      typical door-swing range (0.6–1.2 m) and whose centre lies near a wall
      node is treated as a door.

    Windows:
      Short wall-gap regions where 2–3 closely-spaced parallel lines cross the
      wall opening.  Detected as dense short-segment clusters perpendicular to
      the parent wall.

    Returns list of opening dicts matching the schema:
      { id, wallId, type, t, width, height, sillHeight }
    """
    openings = []
    wall_id_from_nodes = {}   # (sn, en) → wall index (for nearest-wall lookup)

    # Build a quick lookup: wall index for each (startNode, endNode) pair
    # (we only have segments here; wall IDs are assigned later in build_json)
    # We'll use segment index as a proxy and reconcile later.

    # ── 1. Door detection via HoughCircles ────────────────────────────────────
    min_r = int(ppm * 0.55)   # 0.55 m swing radius → px
    max_r = int(ppm * 1.30)   # 1.30 m swing radius → px

    circles = cv2.HoughCircles(
        binary,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=int(ppm * 0.6),   # circles must be at least 0.6 m apart
        param1=60,
        param2=22,                 # higher → fewer false-positive circles
        minRadius=min_r,
        maxRadius=max_r,
    )

    door_centres = []
    if circles is not None:
        for cx, cy, r in np.round(circles[0]).astype(int):
            door_centres.append((int(cx), int(cy), int(r)))

    # ── 2. Map each door circle centre to nearest wall segment ────────────────
    def point_along_seg(px, py, x1, y1, x2, y2):
        """t ∈ [0,1] of closest point on segment to (px,py)."""
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            return 0.0
        t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
        return max(0.0, min(1.0, t))

    def seg_pt_dist(px, py, x1, y1, x2, y2):
        t = point_along_seg(px, py, x1, y1, x2, y2)
        qx = x1 + t * (x2 - x1)
        qy = y1 + t * (y2 - y1)
        return math.hypot(px - qx, py - qy), t

    seen_walls = set()
    for oi, (dcx, dcy, dr) in enumerate(door_centres):
        best_dist, best_seg, best_t = 1e9, -1, 0.5
        for si, (x1, y1, x2, y2) in enumerate(segs):
            d, t = seg_pt_dist(dcx, dcy, x1, y1, x2, y2)
            if d < best_dist:
                best_dist, best_seg, best_t = d, si, t

        # Only attach if the circle centre is within 1 wall-thickness of a wall
        if best_seg < 0 or best_dist > ppm * OUTER_THICK * 3:
            continue
        # t at the very endpoints (< 0.05 or > 0.95) are almost always
        # false positives — the circle is centred on a corner node, not a door.
        if best_t < 0.05 or best_t > 0.95:
            continue
        # Avoid two doors on the same tiny wall
        if best_seg in seen_walls:
            continue
        seen_walls.add(best_seg)

        width_m = round(dr * 2 / ppm, 2)   # diameter = door leaf width approx
        width_m = max(0.7, min(1.2, width_m))

        openings.append({
            '_seg_idx': best_seg,   # resolved to wall ID in build_json
            'type':      'door',
            't':         round(best_t, 3),
            'width':     width_m,
            'height':    2.1,
            'sillHeight':0.0,
        })

    # ── 3. Window detection ───────────────────────────────────────────────────
    # Windows appear as a cluster of short parallel segments that are
    # perpendicular to the parent wall and spaced very closely (< 0.3 m apart).
    # Strategy: find pairs of nearly-parallel segments that are:
    #   • short (< 0.8 m)
    #   • within 20 px of each other (side by side)
    #   • at ~90° to the nearest structural wall

    short_segs = [s for s in segs if _length(*s) / ppm < 0.8]

    used_win = set()
    for i, s1 in enumerate(short_segs):
        if i in used_win:
            continue
        a1 = _angle(*s1)
        cluster = [s1]
        idxs    = [i]
        for j, s2 in enumerate(short_segs):
            if j <= i or j in used_win:
                continue
            a2 = _angle(*s2)
            da = min(abs(a1 - a2), 180 - abs(a1 - a2))
            if da > 8:
                continue
            # perpendicular separation
            mx, my = (s2[0] + s2[2]) / 2, (s2[1] + s2[3]) / 2
            d = _perp_dist(mx, my, s1[0], s1[1], s1[2], s1[3])
            if d < 5:   # collinear — same segment family
                cluster.append(s2); idxs.append(j)

        if len(cluster) < 2:
            continue

        # Cluster centroid
        all_pts = [(x, y) for s in cluster for x, y in [(s[0], s[1]), (s[2], s[3])]]
        ccx = sum(p[0] for p in all_pts) / len(all_pts)
        ccy = sum(p[1] for p in all_pts) / len(all_pts)

        # Find nearest structural (non-short) wall
        long_segs = [s for s in segs if _length(*s) / ppm >= 0.8]
        best_dist, best_seg, best_t = 1e9, -1, 0.5
        for si, seg in enumerate(segs):
            if _length(*seg) / ppm < 0.8:
                continue
            a_wall = _angle(*seg)
            a_clus = a1
            perp_diff = min(abs(abs(a_wall - a_clus) - 90),
                            abs(abs(a_wall - a_clus) - 90 + 180))
            if perp_diff > 20:  # window lines should be perpendicular to wall
                continue
            d, t = seg_pt_dist(ccx, ccy, *seg)
            if d < best_dist:
                best_dist, best_seg, best_t = d, si, t

        if best_seg < 0 or best_dist > ppm * 0.5:
            continue
        if best_seg in seen_walls:
            continue
        seen_walls.add(best_seg)
        for idx in idxs:
            used_win.add(idx)

        # Width = span of cluster along wall direction
        wall = segs[best_seg]
        ang_rad = math.radians(_angle(*wall))
        wdx, wdy = math.cos(ang_rad), math.sin(ang_rad)
        projs = [p[0] * wdx + p[1] * wdy for p in all_pts]
        span_m = (max(projs) - min(projs)) / ppm
        span_m = max(0.6, min(2.4, span_m))

        openings.append({
            '_seg_idx': best_seg,
            'type':      'window',
            't':         round(best_t, 3),
            'width':     round(span_m, 2),
            'height':    1.2,
            'sillHeight':0.9,
        })

    return openings


# ─── 7. OCR label extraction ──────────────────────────────────────────────────

def _ocr_words(gray):
    """
    Run Tesseract with multiple PSM modes and return merged word list
    (each word: {text, cx, cy}).  PSM 6 (block) + 11 (sparse) together
    catch both structured text and scattered labels.
    """
    # Contrast-enhance: CLAHE on the gray image so faint text becomes readable
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Also try a simple contrast stretch
    p2, p98 = np.percentile(gray, 2), np.percentile(gray, 98)
    if p98 > p2:
        stretched = np.clip((gray.astype(np.float32) - p2) / (p98 - p2) * 255, 0, 255).astype(np.uint8)
    else:
        stretched = gray

    # Scale up 2× — dramatically improves OCR on small plan text
    h, w = gray.shape[:2]
    big = cv2.resize(enhanced, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    big2 = cv2.resize(stretched, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)

    words = []
    # Try each image variant × PSM combination
    ocr_sources = [(big, 6), (big, 11), (big2, 6), (big2, 11)]
    for src, psm in ocr_sources:
        try:
            data = pytesseract.image_to_data(
                src,
                config=f'--psm {psm} --oem 3',
                output_type=pytesseract.Output.DICT,
            )
        except Exception:
            continue
        for i, txt in enumerate(data['text']):
            txt = txt.strip()
            if len(txt) < 2 or not any(c.isalpha() for c in txt):
                continue
            conf = int(data['conf'][i])
            if conf < 20:
                continue
            # Scale coords back to original image space
            words.append({
                'text': txt,
                'cx': (data['left'][i] + data['width'][i] / 2) / 2,
                'cy': (data['top'][i] + data['height'][i] / 2) / 2,
            })

    # Deduplicate (same text at nearly same position)
    deduped = []
    for w in words:
        if not any(w['text'].lower() == d['text'].lower()
                   and math.hypot(w['cx'] - d['cx'], w['cy'] - d['cy']) < 20
                   for d in deduped):
            deduped.append(w)
    return deduped


def _match_synonym(text_lower: str):
    """Return a canonical room name if any synonym key appears in text."""
    for key, name in ROOM_SYNONYMS.items():
        if key in text_lower:
            return name
    return None


def assign_labels(gray, rooms: list) -> list:
    """Return a label string for each room (same order as `rooms`)."""
    if not HAS_OCR or not rooms:
        return [_fallback_label(r) for r in rooms]

    words = _ocr_words(gray)

    labels = []
    for room in rooms:
        bx, by, bw, bh = room['bbox']
        cx, cy = room['centroid_px']

        # Expand bbox slightly to catch text near room edges
        pad = max(bw, bh) * 0.12
        inside = [w for w in words
                  if bx - pad <= w['cx'] <= bx + bw + pad
                  and by - pad <= w['cy'] <= by + bh + pad]

        if not inside and words:
            inside = [min(words,
                          key=lambda w: math.hypot(w['cx'] - cx, w['cy'] - cy))]

        if inside:
            # Sort by distance to centroid so closest words come first
            inside.sort(key=lambda w: math.hypot(w['cx'] - cx, w['cy'] - cy))
            combined = ' '.join(w['text'] for w in inside[:6]).lower()
            matched = _match_synonym(combined)
            if not matched:
                # Try individual words
                for w in inside[:4]:
                    matched = _match_synonym(w['text'].lower())
                    if matched:
                        break
            if not matched:
                # Only use raw OCR text if every word looks like real English:
                #  • ≥ 3 alphabetic characters
                #  • no special characters beyond space/hyphen/slash
                #  • starts with a capital or is all-caps (room label convention)
                def _looks_like_label(txt):
                    return (sum(c.isalpha() for c in txt) >= 5   # "Room" min
                            and all(c.isalnum() or c in ' /-' for c in txt)
                            and (txt[0].isupper() or txt.isupper()))
                clean = [w for w in inside[:4] if _looks_like_label(w['text'])]
                if clean:
                    matched = ' '.join(w['text'].title() for w in clean[:2])
                else:
                    matched = _fallback_label(room)
            labels.append(matched)
        else:
            labels.append(_fallback_label(room))

    return labels


def _fallback_label(room: dict) -> str:
    """Guess room type from area when OCR finds nothing."""
    a = room.get('area_m2', 0)
    if a > 18:   return 'Living Room'
    if a > 12:   return 'Bedroom'
    if a > 7:    return 'Kitchen'
    if a > 3:    return 'Bathroom'
    return 'Room'


# ─── 8. JSON assembly ─────────────────────────────────────────────────────────

def px_to_m(v: float, ppm: float) -> float:
    return round(v / ppm, 2)


def _ccw_order_indices(indices, nodes, cx_m, cy_m, ppm):
    """Order node indices CCW around (cx_m, cy_m) given node pixel coords."""
    def angle(i):
        nx, ny = nodes[i]
        return math.atan2(-(ny / ppm - cy_m), nx / ppm - cx_m)
    return sorted(indices, key=angle)


def build_json(segs: list, nodes: list, rooms: list, labels: list,
               ppm: float, raw_openings: list = None) -> dict:
    # ── nodes ──
    json_nodes = [
        {'id': f'n{i + 1}', 'x': px_to_m(x, ppm), 'z': px_to_m(y, ppm)}
        for i, (x, y) in enumerate(nodes)
    ]
    nid = lambda i: f'n{i + 1}'

    # ── walls ──
    # Keep a mapping from segment index → wall id for opening resolution
    seg_to_wall_id = {}
    raw_walls = []
    for si, (x1, y1, x2, y2) in enumerate(segs):
        sn_i = nearest_node(x1, y1, nodes)
        en_i = nearest_node(x2, y2, nodes)
        if sn_i < 0 or en_i < 0 or sn_i == en_i:
            continue
        length_m = _length(x1, y1, x2, y2) / ppm
        thick = OUTER_THICK if length_m >= PARTITION_LEN_M else INNER_THICK
        raw_walls.append((nid(sn_i), nid(en_i), thick, si))

    seen, json_walls = set(), []
    for sn, en, th, si in raw_walls:
        pair = tuple(sorted([sn, en]))
        if pair in seen:
            # segment already merged — still record mapping
            existing = next(w for w in json_walls if tuple(sorted([w['startNode'], w['endNode']])) == pair)
            seg_to_wall_id[si] = existing['id']
            continue
        seen.add(pair)
        wid = f'w{len(json_walls) + 1}'
        json_walls.append({
            'id': wid,
            'startNode': sn,
            'endNode': en,
            'thickness': th,
            'height': WALL_H,
        })
        seg_to_wall_id[si] = wid

    # ── rooms ──
    json_rooms = []
    for room, label in zip(rooms, labels):
        cx, cy = room['centroid_px']

        bx, by, bw, bh = room['bbox']
        pad = NODE_SNAP_PX * 3
        boundary_nodes = [
            i for i, (nx, ny) in enumerate(nodes)
            if bx - pad <= nx <= bx + bw + pad and by - pad <= ny <= by + bh + pad
        ]
        for px, py in room['contour']:
            ni = nearest_node(px, py, nodes, max_d=NODE_SNAP_PX * 4)
            if ni >= 0 and ni not in boundary_nodes:
                boundary_nodes.append(ni)

        if len(boundary_nodes) < 3:
            continue

        ordered = _ccw_order_indices(boundary_nodes, nodes, cx / ppm, cy / ppm, ppm)
        seen_ids, node_ids = set(), []
        for ni in ordered:
            nid_str = nid(ni)
            if nid_str not in seen_ids:
                seen_ids.add(nid_str)
                node_ids.append(nid_str)

        if len(node_ids) < 3:
            continue

        json_rooms.append({
            'id': f'r{len(json_rooms) + 1}',
            'name': label,
            'nodeIds': node_ids,
        })

    # ── openings — resolve _seg_idx → wall id ────────────────────────────────
    json_openings = []
    valid_wall_ids = {w['id'] for w in json_walls}
    for o in (raw_openings or []):
        wid = seg_to_wall_id.get(o.get('_seg_idx', -1))
        if not wid or wid not in valid_wall_ids:
            continue
        entry = {k: v for k, v in o.items() if k != '_seg_idx'}
        entry['id']     = f'o{len(json_openings) + 1}'
        entry['wallId'] = wid
        json_openings.append(entry)

    return {
        'version':  '1.0',
        'units':    'meters',
        'nodes':    json_nodes,
        'walls':    json_walls,
        'rooms':    json_rooms,
        'openings': json_openings,
    }


# ─── validation (mirrors vite plugin logic) ───────────────────────────────────

def validate(data: dict) -> list:
    errors = []
    nodes = {n['id'] for n in data.get('nodes', [])}
    walls = {w['id'] for w in data.get('walls', [])}
    if not nodes:  errors.append('nodes is empty')
    if not data.get('walls'):  errors.append('walls is empty')
    if not data.get('rooms'):  errors.append('rooms is empty')
    for w in data.get('walls', []):
        if w['startNode'] not in nodes: errors.append(f"wall {w['id']}: bad startNode")
        if w['endNode']   not in nodes: errors.append(f"wall {w['id']}: bad endNode")
    for r in data.get('rooms', []):
        if len(r.get('nodeIds', [])) < 3:
            errors.append(f"room {r['id']}: fewer than 3 nodes")
        for nid in r.get('nodeIds', []):
            if nid not in nodes:
                errors.append(f"room {r['id']}: unknown node {nid}")
    return errors


# ─── main ─────────────────────────────────────────────────────────────────────

def extract(image_path: str) -> dict:
    img, gray, binary, scale = load_and_preprocess(image_path)
    h, w = binary.shape
    ppm = estimate_ppm(gray, w, h)

    # ── Furniture removal (before wall detection) ─────────────────────────────
    # Erase isolated hollow-rectangle white blobs (beds, sofas, chairs, cars)
    # so they don't generate spurious HoughLines or false room enclosures.
    binary = remove_furniture_components(binary, ppm)

    raw      = detect_raw_lines(binary)
    segs     = merge_segments(raw)
    nodes    = build_nodes(segs)
    rooms    = detect_rooms(binary, ppm, segs=segs)   # synthetic canvas
    openings = detect_openings(binary, segs, nodes, ppm)
    labels  = assign_labels(gray, rooms)
    result  = build_json(segs, nodes, rooms, labels, ppm, raw_openings=openings)

    return result


def main():
    if len(sys.argv) < 2:
        sys.stderr.write('Usage: extract_plan.py <image_path> [output.json]\n')
        sys.exit(1)

    path = sys.argv[1]
    out  = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        result = extract(path)
    except Exception as e:
        sys.stderr.write(f'[extract_plan] ERROR: {e}\n')
        sys.exit(1)

    errs = validate(result)
    if errs:
        sys.stderr.write('[extract_plan] Validation warnings:\n')
        for e in errs:
            sys.stderr.write(f'  • {e}\n')

    output = json.dumps(result, indent=2)
    if out:
        Path(out).write_text(output)
        sys.stderr.write(f'[extract_plan] Saved to {out}\n')
    else:
        sys.stdout.write(output + '\n')


if __name__ == '__main__':
    main()
