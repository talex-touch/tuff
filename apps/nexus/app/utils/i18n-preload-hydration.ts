/**
 * Keeps the locale-messages request off the hydration critical path.
 *
 * With `i18n.experimental.preload` the SSR HTML already carries the messages the render used,
 * and nuxt-i18n merges them before any plugin runs. Its `route-locale-detect` plugin then still
 * awaits `loadMessages(locale)` — a `$fetch` of `/_i18n/<hash>/<locale>/messages.json` — before
 * the app is allowed to mount, so a full network round trip sat between DOMContentLoaded and
 * hydration on every page (measured at 0.5–17 s from CN). The messages that fetch brings are
 * only needed by components that mount later, so the load is started immediately but not
 * awaited while hydrating; once it resolves, vue-i18n merges it reactively.
 *
 * Outside hydration (locale switches, the preload plugin's first-navigation reload) the loader
 * behaves exactly as before. A load that was deferred during hydration is handed back to the
 * next caller for the same locale instead of being fetched twice.
 */
export interface HydrationAwareMessageContext {
  preloaded: boolean
  loadMessages: (locale: string) => Promise<unknown>
}

export interface HydrationAwareNuxtApp {
  isHydrating?: boolean
}

export function installHydrationAwareMessageLoader(nuxtApp: HydrationAwareNuxtApp, ctx: HydrationAwareMessageContext) {
  const load = ctx.loadMessages
  const deferred = new Map<string, Promise<unknown>>()

  ctx.loadMessages = async (locale: string) => {
    const pending = deferred.get(locale)
    if (pending) {
      deferred.delete(locale)
      return pending
    }

    if (nuxtApp.isHydrating && ctx.preloaded) {
      // The render already has what it needs; let the full set arrive while hydration proceeds.
      deferred.set(locale, load(locale).catch(() => undefined))
      return
    }

    return load(locale)
  }
}
