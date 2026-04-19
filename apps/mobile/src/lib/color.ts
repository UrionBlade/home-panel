/** sRGB gamma decode */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance from linear RGB (0-1) */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/**
 * Returns "#1a1a1a" or "#ffffff" based on the perceived brightness
 * of the given hex color. Works with both oklch strings and hex.
 */
export function contrastFg(color: string): string {
  // oklch(62% 0.19 250) → read L directly
  const oklchMatch = color.match(/oklch\(\s*([\d.]+)%/);
  if (oklchMatch) {
    return Number(oklchMatch[1]) > 55 ? "#1a1a1a" : "#ffffff";
  }

  // hex → relative luminance with sRGB linearization
  const hex = color.replace("#", "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return luminance(r, g, b) > 0.18 ? "#1a1a1a" : "#ffffff";
  }

  return "#ffffff";
}

/** Parse hex to [r, g, b] in 0-1 range */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/** Compute relative luminance from hex string */
export function hexLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return luminance(r, g, b);
}
