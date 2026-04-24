/**
 * colorTemp.ts — Convert a colour temperature (Kelvin) to an RGB hex string
 * and a THREE.Color-compatible triplet.
 *
 * Uses the Tanner Helland / Neil Bartlett approximation of the Planckian locus,
 * which is accurate to within ±1% for 1000–40000 K and cheap to compute.
 *
 * References:
 *   https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html
 */

/** Clamp a value to [0, 255]. */
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Convert Kelvin → { r, g, b } in 0–255 range.
 */
export function tempToRGB(kelvin: number): { r: number; g: number; b: number } {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;

  // ── Red ──────────────────────────────────────────────────────────────────
  let r: number;
  if (t <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
  }

  // ── Green ─────────────────────────────────────────────────────────────────
  let g: number;
  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }

  // ── Blue ──────────────────────────────────────────────────────────────────
  let b: number;
  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  }

  return { r: clamp(r), g: clamp(g), b: clamp(b) };
}

/**
 * Convert Kelvin → CSS hex string (e.g. "#fff8e8").
 */
export function tempToHex(kelvin: number): string {
  const { r, g, b } = tempToRGB(kelvin);
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert Kelvin + intensity → THREE.Color-compatible [r, g, b] in 0–1 range.
 * Intensity values > 1 can produce HDR colours for PBR renderers.
 */
export function tempToThreeColor(kelvin: number): [number, number, number] {
  const { r, g, b } = tempToRGB(kelvin);
  return [r / 255, g / 255, b / 255];
}

/**
 * Convert elevation (0–90°) and azimuth (0–360°, 0=north/+Z, 90=east/+X)
 * into a THREE.js world-space directional light position.
 *
 * The position is at a fixed distance so the direction is what matters;
 * directional lights treat position as a direction vector only.
 */
export function sunPosition(
  elevationDeg: number,
  azimuthDeg:   number,
  distance = 40,
): [number, number, number] {
  const el  = (elevationDeg * Math.PI) / 180;
  const az  = (azimuthDeg  * Math.PI) / 180;
  const cos = Math.cos(el);
  return [
    cos * Math.sin(az) * distance,   // X  (east)
    Math.sin(el)       * distance,   // Y  (up)
    cos * Math.cos(az) * distance,   // Z  (north)
  ];
}
