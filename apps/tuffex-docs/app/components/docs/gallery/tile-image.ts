/* Inline SVG so the gallery never waits on (or fails) a network image. Three
   flat swatches read as colour chips, not as photographs, which made the cell
   look like the wrong component; a gradient with a horizon and a light source
   is enough for a thumbnail grid to read as one.

   `scale` only changes the intrinsic size, the scene stays 160×120: a viewer
   that shows an image at its own size needs more pixels than a thumbnail. */
export function tileImage(from: string, to: string, sun: string, scale = 1): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="${160 * scale}" height="${120 * scale}">`
    + `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>`
    + `</linearGradient></defs>`
    + `<rect width="160" height="120" fill="url(#s)"/>`
    + `<circle cx="38" cy="34" r="16" fill="${sun}" opacity="0.85"/>`
    + `<path d="M0 92 L46 62 L84 86 L118 60 L160 88 L160 120 L0 120 Z" fill="#0f172a" opacity="0.42"/>`
    + `<path d="M0 104 L54 78 L96 100 L134 80 L160 96 L160 120 L0 120 Z" fill="#0f172a" opacity="0.62"/>`
    + `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
