import { installHydrationAwareMessageLoader } from '~/utils/i18n-preload-hydration'
import type { HydrationAwareMessageContext } from '~/utils/i18n-preload-hydration'

interface I18nContextHolder {
  _nuxtI18n?: HydrationAwareMessageContext
}

/**
 * nuxt-i18n creates its context inside its own plugin and its locale-detect plugin consumes it
 * in the same plugin pass, so nothing registered later can reach the first `loadMessages` call.
 * Running with `enforce: 'pre'` and intercepting the context assignment is the one seam that
 * exists; see `~/utils/i18n-preload-hydration` for what the wrapper does and why. If nuxt-i18n
 * ever stops assigning `_nuxtI18n`, the setter simply never fires and behaviour returns to the
 * awaited fetch — slower, never broken.
 */
export default defineNuxtPlugin({
  name: 'nexus:i18n-preload-hydration',
  enforce: 'pre',
  setup(nuxtApp) {
    const holder = nuxtApp as unknown as I18nContextHolder
    if (Object.getOwnPropertyDescriptor(holder, '_nuxtI18n'))
      return

    let context: HydrationAwareMessageContext | undefined
    Object.defineProperty(holder, '_nuxtI18n', {
      configurable: true,
      enumerable: true,
      get: () => context,
      set: (value: HydrationAwareMessageContext | undefined) => {
        context = value
        if (value && typeof value.loadMessages === 'function')
          installHydrationAwareMessageLoader(nuxtApp, value)
      },
    })
  },
})
