import { createI18n } from 'vue-i18n'
import { resolveLocaleFromPath } from '~/utils/web-route'
import { createTuffWebI18nOptions } from '../../i18n/i18n.config'

/**
 * Pure synchronous vue-i18n plugin with statically bundled bilingual EN + ZH messages:
 * - Resolves initial locale directly from the current URL prefix before first render (SSR + CSR).
 * - ZERO `/_i18n/<hash>/<locale>/messages.json` network fetches and ZERO Flash-of-English!
 */
export default defineNuxtPlugin((nuxtApp) => {
  const route = useRoute()
  const initialLocale = resolveLocaleFromPath(route.path)

  const i18n = createI18n({
    ...createTuffWebI18nOptions(),
    locale: initialLocale,
  })

  nuxtApp.vueApp.use(i18n)
})
