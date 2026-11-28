import { hasWindow } from '@talex-touch/utils/env'

const DEMO_INITIAL_IDLE_TIMEOUT_MS = 250
const NAV_IDLE_TIMEOUT_MS = 200
const FALLBACK_DELAY_MS = 32
const DEMO_DOCS_ROUTE_RE = /(?:^|\/)docs\/dev(?:\/|$)/

/**
 * Loads the UnoCSS icon layers after Suspense resolves without entering the render-blocking
 * `entry.css` sheet or competing with initial hydration.
 *
 * Importing `uno:icons.css` and `uno:demo-icons.css` dynamically keeps both layers out of
 * `entry.css`. `uno:icons.css` starts promptly in a microtask as soon as `app:suspense:resolve`
 * fires (never on `app:mounted`, and without a 1.2s idle delay that left header/sidebar buttons
 * blank). `uno:demo-icons.css` holds icons referenced only by `app/components/content/demos/*`
 * and stays lazy in an idle slot only when visiting `/docs/dev/*` routes.
 */
export default defineNuxtPlugin({
  name: 'nexus:unocss-icons',
  setup(nuxtApp) {
    let baseScheduled = false
    let demoScheduled = false

    const schedulePrompt = (task: () => void) => {
      if (!hasWindow())
        return
      if (typeof queueMicrotask === 'function')
        queueMicrotask(task)
      else
        window.setTimeout(task, 0)
    }

    const scheduleIdle = (task: () => void, timeoutMs: number) => {
      if (!hasWindow())
        return
      if (typeof window.requestIdleCallback === 'function')
        window.requestIdleCallback(task, { timeout: timeoutMs })
      else
        window.setTimeout(task, FALLBACK_DELAY_MS)
    }

    const loadBaseIcons = () => {
      void import('uno:icons.css')
    }

    const loadDemoIcons = () => {
      void import('uno:demo-icons.css')
    }

    const scheduleDemoIconsForPath = (path: string | undefined, timeoutMs: number) => {
      if (demoScheduled || !path || !DEMO_DOCS_ROUTE_RE.test(path))
        return
      demoScheduled = true
      scheduleIdle(loadDemoIcons, timeoutMs)
    }

    const scheduleIcons = () => {
      if (baseScheduled)
        return
      baseScheduled = true
      schedulePrompt(loadBaseIcons)

      const router = nuxtApp.$router as { currentRoute?: { value?: { path?: string } } } | undefined
      const currentPath = router?.currentRoute?.value?.path ?? (hasWindow() ? window.location.pathname : '')
      scheduleDemoIconsForPath(currentPath, DEMO_INITIAL_IDLE_TIMEOUT_MS)
    }

    nuxtApp.hook('app:suspense:resolve', scheduleIcons)

    const router = nuxtApp.$router as { afterEach?: (hook: (to: { path?: string }) => void) => void } | undefined
    router?.afterEach?.((to) => {
      scheduleDemoIconsForPath(to.path, NAV_IDLE_TIMEOUT_MS)
    })
  },
})
