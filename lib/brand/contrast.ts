// ============================================================
// Brand contrast — oklch → sRGB, and WCAG 2.1 contrast ratios
// ============================================================
//
// Pure functions, no dependencies. These exist so the brand tokens in
// `app/globals.css` can be asserted in CI: the theme is authored in
// oklch(), but WCAG's contrast maths is defined on gamma-encoded sRGB,
// so a token pair cannot be checked without converting first.
//
// See `__tests__/contrast.test.ts` for the guard that consumes them.

/** Gamma-encode a linear-light sRGB channel (IEC 61966-2-1). */
function encodeGamma(channel: number): number {
  return channel <= 0.0031308
    ? 12.92 * channel
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

/** Decode a gamma-encoded sRGB channel back to linear light. */
function decodeGamma(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Convert an oklch() colour to a `#RRGGBB` string.
 *
 * @param l Lightness, 0–1 (CSS also allows 0%–100%; pass the 0–1 form).
 * @param c Chroma, 0–~0.4.
 * @param h Hue, in degrees.
 *
 * Out-of-gamut colours are clamped per-channel into sRGB, which is what
 * a browser does when it rasterises them to a non-wide-gamut surface.
 */
export function oklchToHex(l: number, c: number, h: number): string {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  // OKLab → non-linear LMS
  const lCbrt = l + 0.3963377774 * a + 0.2158037573 * b;
  const mCbrt = l - 0.1055613458 * a - 0.0638541728 * b;
  const sCbrt = l - 0.0894841775 * a - 1.291485548 * b;

  // → linear LMS
  const lLms = lCbrt ** 3;
  const mLms = mCbrt ** 3;
  const sLms = sCbrt ** 3;

  // → linear sRGB
  const rLin = 4.0767416621 * lLms - 3.3077115913 * mLms + 0.2309699292 * sLms;
  const gLin = -1.2684380046 * lLms + 2.6097574011 * mLms - 0.3413193965 * sLms;
  const bLin = -0.0041960863 * lLms - 0.7034186147 * mLms + 1.707614701 * sLms;

  const toByte = (linear: number) =>
    Math.round(clamp01(encodeGamma(linear)) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

  return `#${toByte(rLin)}${toByte(gLin)}${toByte(bLin)}`;
}

/** Parse `#RGB` or `#RRGGBB` into 0–1 sRGB channels. */
function hexToRgb(hex: string): [number, number, number] {
  let value = hex.trim().replace(/^#/, "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Not a hex colour: ${hex}`);
  }
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

/**
 * WCAG 2.1 relative luminance of a `#RRGGBB` colour.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(decodeGamma);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.1 contrast ratio between two colours, `(L1 + 0.05) / (L2 + 0.05)`.
 * Ranges 1–21. Symmetric: argument order does not matter.
 *
 * AA needs >= 4.5 for body text, >= 3 for large text (>=18.66px bold or
 * >=24px). The brand buttons are small text, so 4.5 is the floor.
 */
export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
