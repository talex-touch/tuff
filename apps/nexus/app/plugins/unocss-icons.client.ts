/**
 * Loads the UnoCSS icons layer after the first render.
 *
 * Importing `uno:icons.css` anywhere makes UnoCSS leave that layer out of the `uno.css` entry
 * the module injects, so the render-blocking shared stylesheet no longer carries ~184 KB of
 * inline SVG (38 KB gzip) on every page — more than half of it. The layer arrives as its own
 * cacheable asset after the first render; until then the preflight in `uno.config.ts`
 * keeps every `i-*` box at its final size, so the glyphs paint in without moving anything.
 *
 * It starts once the root Suspense has resolved, then in an idle slot. `app:mounted` fires 0.5 to
 * 2.8 s before the root Suspense resolves, and the layer used to start in that gap, competing with
 * the demo chain for the main thread.
 *
 * Importing it dynamically rather than statically is what keeps it off the critical path: a
 * static import would land in the entry chunk's CSS again.
 */
const ICONS_IDLE_TIMEOUT_MS = 3000
/** A page whose root Suspense never resolves still gets its icons, a little later. */
const ICONS_FALLBACK_MS = 8000

export default defineNuxtPlugin({
  name: 'nexus:unocss-icons',
  setup(nuxtApp) {
    let scheduled = false
    const loadIcons = () => {
      void import('uno:icons.css')
    }
    const scheduleIcons = () => {
      if (scheduled)
        return
      scheduled = true
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(loadIcons, { timeout: ICONS_IDLE_TIMEOUT_MS })
        return
      }
      window.setTimeout(loadIcons, 0)
    }

    nuxtApp.hook('app:suspense:resolve', scheduleIcons)
    nuxtApp.hook('app:mounted', () => {
      window.setTimeout(scheduleIcons, ICONS_FALLBACK_MS)
    })
  },
})
