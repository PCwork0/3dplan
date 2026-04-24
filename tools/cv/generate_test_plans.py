#!/usr/bin/env python3
"""
generate_test_plans.py — Draw 3 synthetic floor plan PNGs for CV testing.

Test plans:
  plan_01_2room.png   — 2-room apartment (living + bedroom + bathroom)
  plan_02_4room.png   — 4-room Indian apartment (2BHK with corridor)
  plan_03_lshape.png  — L-shaped 3-room layout

All plans use:
  - White background
  - Black walls (thick lines)
  - Room labels inside each room
  - Dimension text on key walls
"""

from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(__file__), 'test_plans')
os.makedirs(OUT, exist_ok=True)

SCALE = 60          # px per metre
WALL  = 10          # wall thickness in px
BG    = (255, 255, 255)
WALL_C= (20, 20, 20)
TEXT_C= (15, 15, 15)
DIM_C = (80, 80, 160)
MARGIN = 60         # px border around plan

def px(metres):
    return int(metres * SCALE)

def draw_wall(draw, x1m, y1m, x2m, y2m, ox=MARGIN, oy=MARGIN):
    x1 = ox + px(x1m); y1 = oy + px(y1m)
    x2 = ox + px(x2m); y2 = oy + px(y2m)
    draw.line([(x1, y1), (x2, y2)], fill=WALL_C, width=WALL)

def draw_label(draw, xm, ym, text, ox=MARGIN, oy=MARGIN, font=None, color=TEXT_C):
    x = ox + px(xm); y = oy + px(ym)
    draw.text((x, y), text, fill=color, font=font, anchor='mm')

def draw_dim(draw, x1m, y1m, x2m, y2m, label, ox=MARGIN, oy=MARGIN, font=None):
    """Draw a small dimension label near the midpoint of a wall."""
    mx = ox + px((x1m + x2m) / 2)
    my = oy + px((y1m + y2m) / 2)
    draw.text((mx + 8, my - 10), label, fill=DIM_C, font=font, anchor='lm')

try:
    font_label = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
    font_small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
    font_dim   = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
except Exception:
    font_label = ImageFont.load_default()
    font_small = font_label
    font_dim   = font_label

# ══════════════════════════════════════════════════════════════════════════════
# Plan 1 — Simple 2-room apartment  (Living + Bedroom + Bathroom)
#
#   +---- 8.0 m ------+
#   |                  | 4.5 m   Living Room
#   +-------+----------+
#   | Bath  |  Bedroom | 3.5 m
#   +-------+----------+
#     2.5 m    5.5 m
# ══════════════════════════════════════════════════════════════════════════════

def make_plan_01():
    W, H = 8.0, 8.0        # plan extents in metres
    iw = MARGIN * 2 + px(W)
    ih = MARGIN * 2 + px(H)
    img = Image.new('RGB', (iw, ih), BG)
    d = ImageDraw.Draw(img)

    def wall(x1, y1, x2, y2): draw_wall(d, x1, y1, x2, y2)
    def label(x, y, t, big=True):
        draw_label(d, x, y, t, font=font_label if big else font_small)
    def dim(x1, y1, x2, y2, t):
        draw_dim(d, x1, y1, x2, y2, t, font=font_dim)

    # Outer perimeter
    wall(0, 0, W, 0)       # top
    wall(W, 0, W, H)       # right
    wall(W, H, 0, H)       # bottom
    wall(0, H, 0, 0)       # left

    # Horizontal divider at y=4.5 (Living / lower rooms)
    wall(0, 4.5, W, 4.5)

    # Vertical divider at x=2.5 (Bath / Bedroom)
    wall(2.5, 4.5, 2.5, H)

    # Labels
    label(W/2, 2.25, 'Living Room')
    label(1.25, 6.25, 'Bathroom', big=False)
    label(5.25, 6.25, 'Bedroom')

    # Dimensions
    dim(0, 0, W, 0, '8.0 m')
    dim(0, 0, 0, 4.5, '4.5 m')
    dim(0, 4.5, 0, H,  '3.5 m')
    dim(0, 4.5, 2.5, 4.5, '2.5 m')
    dim(2.5, 4.5, W, 4.5, '5.5 m')

    img.save(os.path.join(OUT, 'plan_01_2room.png'))
    print('  ✓ plan_01_2room.png')


# ══════════════════════════════════════════════════════════════════════════════
# Plan 2 — 4-room Indian 2BHK  (Living + Dining + 2 Bedrooms + Kitchen + Bath)
#
#   +------ 12.0 m -----------+
#   |   Living    |  Dining   | 4.5 m
#   +------+------+----+------+
#   | Bed1 | Corridor  | Bath | 2.0 m
#   +------+-----------+------+
#   | Bed2      | Kitchen     | 4.5 m
#   +------+----+-------------+
#     5.0 m  2.0 m  5.0 m
# ══════════════════════════════════════════════════════════════════════════════

def make_plan_02():
    W, H = 12.0, 11.0
    iw = MARGIN * 2 + px(W)
    ih = MARGIN * 2 + px(H)
    img = Image.new('RGB', (iw, ih), BG)
    d = ImageDraw.Draw(img)

    def wall(x1, y1, x2, y2): draw_wall(d, x1, y1, x2, y2)
    def label(x, y, t, big=True):
        draw_label(d, x, y, t, font=font_label if big else font_small)
    def dim(x1, y1, x2, y2, t):
        draw_dim(d, x1, y1, x2, y2, t, font=font_dim)

    # Outer perimeter
    wall(0,  0, W,  0)
    wall(W,  0, W,  H)
    wall(W,  H, 0,  H)
    wall(0,  H, 0,  0)

    # Horizontal dividers
    wall(0,   4.5, W,  4.5)   # living+dining / middle band
    wall(0,   6.5, W,  6.5)   # corridor / lower rooms

    # Vertical dividers — top band
    wall(6.0, 0.0, 6.0, 4.5)  # living | dining

    # Vertical dividers — middle band (corridor)
    wall(5.0, 4.5, 5.0, 6.5)  # bed1 | corridor
    wall(9.0, 4.5, 9.0, 6.5)  # corridor | bath

    # Vertical dividers — bottom band
    wall(5.0, 6.5, 5.0, H)    # bed2 | kitchen

    # Labels
    label(3.0,  2.25, 'Living Room')
    label(9.0,  2.25, 'Dining Room')
    label(2.5,  5.5,  'Bedroom 2', big=False)
    label(7.0,  5.5,  'Corridor',  big=False)
    label(10.5, 5.5,  'Bath',      big=False)
    label(2.5,  8.75, 'Master Bedroom')
    label(8.5,  8.75, 'Kitchen')

    # Dimensions
    dim(0, 0, W, 0,    '12.0 m')
    dim(0, 0, 0, 4.5,  '4.5 m')
    dim(0, 4.5, 0, 6.5,'2.0 m')
    dim(0, 6.5, 0, H,  '4.5 m')

    img.save(os.path.join(OUT, 'plan_02_4room.png'))
    print('  ✓ plan_02_4room.png')


# ══════════════════════════════════════════════════════════════════════════════
# Plan 3 — 3-room rectangular layout  (Living + Bedroom + Kitchen)
#
#   +------ 9.0 m ------+
#   |                    | 5.0 m   Living Room
#   |   Living Room      |
#   +------+-------------+
#   | Bed  |   Kitchen   | 4.0 m
#   |      |             |
#   +------+-------------+
#    3.0 m      6.0 m
# ══════════════════════════════════════════════════════════════════════════════

def make_plan_03():
    W, H = 9.0, 9.0
    iw = MARGIN * 2 + px(W)
    ih = MARGIN * 2 + px(H)
    img = Image.new('RGB', (iw, ih), BG)
    d = ImageDraw.Draw(img)

    def wall(x1, y1, x2, y2): draw_wall(d, x1, y1, x2, y2)
    def label(x, y, t, big=True):
        draw_label(d, x, y, t, font=font_label if big else font_small)
    def dim(x1, y1, x2, y2, t):
        draw_dim(d, x1, y1, x2, y2, t, font=font_dim)

    # Outer rectangle
    wall(0, 0, W, 0)
    wall(W, 0, W, H)
    wall(W, H, 0, H)
    wall(0, H, 0, 0)

    # Horizontal divider at y=5 — Living / lower rooms
    wall(0, 5.0, W, 5.0)

    # Vertical divider at x=3, bottom half only — Bedroom / Kitchen
    wall(3.0, 5.0, 3.0, H)

    # Labels
    label(W/2, 2.5,  'Living Room')
    label(1.5,  7.0, 'Bedroom')
    label(6.0,  7.0, 'Kitchen')

    # Dimensions
    dim(0, 0, W, 0,      '9.0 m')
    dim(0, 0, 0, 5.0,    '5.0 m')
    dim(0, 5.0, 0, H,    '4.0 m')
    dim(0, H,  3.0, H,   '3.0 m')
    dim(3.0, H, W, H,    '6.0 m')

    img.save(os.path.join(OUT, 'plan_03_lshape.png'))
    print('  ✓ plan_03_lshape.png')


if __name__ == '__main__':
    print('Generating test floor plans...')
    make_plan_01()
    make_plan_02()
    make_plan_03()
    print(f'Done — saved to {OUT}/')
