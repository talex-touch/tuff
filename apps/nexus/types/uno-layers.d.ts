/**
 * Per-layer UnoCSS virtual entries (`uno:<layer>.css`). The `unocss` package declares
 * `uno.css` only; this app imports the icon layers on their own so they can load after
 * hydration (`icons` on every page, `demo-icons` only on docs demo routes).
 */
declare module 'uno:icons.css' {}
declare module 'uno:demo-icons.css' {}
