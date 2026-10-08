import { createRequire } from 'node:module'
import { ensureRouteLocaleChunk } from '~/composables/useRouteLocaleChunks'
import baseEn from '../../i18n/locales/en'
import baseZh from '../../i18n/locales/zh'

export type RouteI18nLocale = 'en' | 'zh'

export interface RouteI18n {
  /** vue-i18n's `t(key, named, plural)`; without `plural` it is `t(key, named)`. */
  t: (key: string, named: Record<string, unknown>, plural?: number) => string
  setLocale: (locale: RouteI18nLocale) => void
}

/** The part of vue-i18n's composition API these tests use. */
interface VueI18nGlobal {
  t: RouteI18n['t']
  locale: { value: string }
  mergeLocaleMessage: (locale: string, messages: Record<string, unknown>) => void
}

interface VueI18nModule {
  createI18n: (options: Record<string, unknown>) => { global: VueI18nGlobal }
}

/**
 * Nexus messages rendered the way the console renders them, for tests where the
 * message syntax matters — a plural — and not only that a key exists:
 *
 * - the vue-i18n that `@nuxtjs/i18n` ships and runs (Nexus does not depend on
 *   vue-i18n itself, so it is resolved from there rather than imported);
 * - the base messages `i18n.config.ts` registers;
 * - the lazily loaded `dashboard` route chunk merged by `ensureRouteLocaleChunk`,
 *   as `useRouteLocaleChunks` merges it on an admin route.
 *
 * The messages stay plain strings, so vue-i18n's message compiler reads them when
 * they are first rendered, as it does in the browser.
 */
export async function createRouteI18n(locale: RouteI18nLocale = 'en'): Promise<RouteI18n> {
  const requireFromNexus = createRequire(import.meta.url)
  const requireFromNuxtI18n = createRequire(requireFromNexus.resolve('@nuxtjs/i18n'))
  const { createI18n } = requireFromNuxtI18n('vue-i18n') as VueI18nModule
  const { global } = createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages: { en: baseEn, zh: baseZh },
  })
  await ensureRouteLocaleChunk(global, 'en', 'dashboard')
  await ensureRouteLocaleChunk(global, 'zh', 'dashboard')
  return {
    t: (key, named, plural) => global.t(key, named, plural),
    setLocale: (next) => {
      global.locale.value = next
    },
  }
}
