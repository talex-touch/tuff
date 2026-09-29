// Ported from voice-glow/src/color.ts
// (https://github.com/Jakubantalik/Libraries). MIT License © 2026 Jakub Antalik.
// Framework-free module kept intentionally close to upstream; local deviations
// are limited to strict-TS (noUncheckedIndexedAccess) hardening so upstream
// fixes stay diffable.

/**
 * Colour parsing for the palette and band props: `#rgb`, `#rrggbb`,
 * `rgb(r, g, b)` and `rgba(r, g, b, a)` all resolve to an [r, g, b]
 * triple. Anything else returns null and the caller keeps its default.
 */
export function parseRgb(color: string): [number, number, number] | null {
  const c = color.trim();
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1]!;
    const h = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const fn = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (fn) return [Math.round(+fn[1]!), Math.round(+fn[2]!), Math.round(+fn[3]!)];
  return null;
}

/** `rgb(r, g, b)` for the stylesheet, or null if unparseable. */
export function toRgb(color: string): string | null {
  const t = parseRgb(color);
  return t ? `rgb(${t[0]}, ${t[1]}, ${t[2]})` : null;
}

/** `r, g, b` for the canvas (dropped into rgba()), or null. */
export function toTriple(color: string): string | null {
  const t = parseRgb(color);
  return t ? `${t[0]}, ${t[1]}, ${t[2]}` : null;
}
