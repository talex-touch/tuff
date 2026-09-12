/**
 * Loads the UnoCSS icons layer after the app has mounted.
 *
 * Importing `uno:icons.css` anywhere makes UnoCSS leave that layer out of the `uno.css` entry
 * the module injects, so the render-blocking shared stylesheet no longer carries ~184 KB of
 * inline SVG (38 KB gzip) on every page — more than half of it. The layer arrives as its own
 * cacheable asset once the page is interactive; until then the preflight in `uno.config.ts`
 * keeps every `i-*` box at its final size, so the glyphs paint in without moving anything.
 *
 * Importing it dynamically rather than statically is what keeps it off the critical path: a
 * static import would land in the entry chunk's CSS again.
 */
export default defineNuxtPlugin({
  name: 'nexus:unocss-icons',
  setup(nuxtApp) {
    nuxtApp.hook('app:mounted', () => {
      void import('uno:icons.css')
    })
  },
})
