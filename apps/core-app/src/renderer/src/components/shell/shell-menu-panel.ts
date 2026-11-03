/**
 * The material every sidebar menu wears: the library's `refraction` surface, drawn for a panel this
 * size.
 *
 * Two knobs, both measured on a real GPU render rather than judged by eye.
 *
 * `refractionRenderer: 'svg'` — TuffEx defaults this to `'css'` since 29785f27d, because the SVG
 * displacement map is rasterized per compositor frame and a 1526x1886 panel fell to ~5fps. A menu is
 * ~220x93, where that cost is a fraction of a frame. Without it the panel keeps only its blur and
 * tint: measured over a bright stripe, chromatic dispersion is 0.01 — the background is visible
 * *through* a frosted sheet, which is exactly what it looked like. With the SVG layer it is 1.94.
 *
 * `glassOverlayOpacity: 0.55` — anchored panels default to 0.38, which lands around 0.42 effective.
 * A conversation row's own title sits directly under its menu, and at 0.42 the blurred text still
 * reads through it. Over a solid black band the panel interior went from 147/255 to 183/255 at
 * 0.55, while the 琉光 still shows at the edges.
 *
 * `flowLight: 'corners'` is the fixed brand light the project menu already used, so a menu opened
 * from a conversation glows the same as one opened from its folder. One object for every render.
 */
export const SHELL_MENU_CARD = {
  flowLight: 'corners',
  refractionRenderer: 'svg',
  glassOverlayOpacity: 0.55
} as const
