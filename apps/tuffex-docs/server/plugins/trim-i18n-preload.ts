import { type ServerI18nContext, trimServerI18nContext } from '../utils/i18nPreloadTrim'

/**
 * `@nuxtjs/i18n@10.4.0` disables `stripMessagesPayload` whenever `nitro.preset === 'static'`
 * (`if (__I18N_STRIP_UNUSED__ && !__IS_SSG__)`), which serializes 100% of BOTH `en` and `zh`
 * dictionaries (~15–17.5 KiB) inline into every prerendered HTML page even though `trackKey()`
 * still records SSR-used keys in `event.context.nuxtI18n.trackMap`.
 *
 * Prepends our trimmer ahead of `@nuxtjs/i18n`'s `render:html` listener so
 * `event.context.nuxtI18n.messages` is trimmed to the active locale's tracked keys
 * immediately before `@nuxtjs/i18n` calls `devalue.stringify(ctx.messages)`.
 */
export default defineNitroPlugin((nitroApp) => {
  const hooksMap = (nitroApp.hooks as unknown as {
    _hooks?: Record<string, Array<(...args: unknown[]) => unknown>>
  })._hooks

  const trimHandler = (_htmlContext: unknown, rawContext?: unknown) => {
    const context = rawContext as { event?: { path?: string, context?: { nuxtI18n?: ServerI18nContext } } } | undefined
    trimServerI18nContext(context?.event?.context?.nuxtI18n, context?.event?.path)
  }

  if (hooksMap && Array.isArray(hooksMap['render:html'])) {
    hooksMap['render:html'].unshift(trimHandler)
  }
  else {
    nitroApp.hooks.hook('render:html', trimHandler as never)
  }
})
