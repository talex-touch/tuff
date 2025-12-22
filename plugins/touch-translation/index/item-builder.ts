import type { TranslationResult } from './types'
import { formatOriginalSnippet, getTranslationItemId } from './utils'

const { TuffItemBuilder } = globalThis as any
const PLUGIN_NAME = 'touch-translation'

export function createPendingItem(
  originalText: string,
  featureId: string,
  service: string,
  from: string,
  to: string
) {
  const serviceName = service.charAt(0).toUpperCase() + service.slice(1)
  const originalSnippet = formatOriginalSnippet(originalText)
  const subtitle = `原文: ${originalSnippet || originalText} · ${serviceName}: ${from} → ${to} (翻译中…)`

  return new TuffItemBuilder(getTranslationItemId(originalText, service))
    .setSource('plugin', 'plugin-features')
    .setTitle('翻译中…')
    .setSubtitle(subtitle)
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .addTag('Translation', 'blue')
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      pluginType: 'translation',
      originalText,
      translatedText: '',
      fromLang: from,
      toLang: to,
      serviceName: service,
      pending: true,
    })
    .build()
}

export function createSuccessItem(
  originalText: string,
  result: TranslationResult,
  featureId: string
) {
  const { text: translatedText, from, to, service, provider, model } = result
  const serviceName = service.charAt(0).toUpperCase() + service.slice(1)
  const originalSnippet = formatOriginalSnippet(originalText)
  const providerInfo = provider && model ? ` (${provider}/${model})` : ''
  const subtitle = `原文: ${originalSnippet || originalText} · ${serviceName}${providerInfo}: ${from || 'auto'} → ${to}`

  return new TuffItemBuilder(getTranslationItemId(originalText, service))
    .setSource('plugin', 'plugin-features')
    .setTitle(translatedText)
    .setSubtitle(subtitle)
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .createAndAddAction('copy-translation', 'copy', '复制', translatedText)
    .addTag('Translation', 'green')
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: 'copy',
      pluginType: 'translation',
      originalText,
      translatedText,
      fromLang: from || 'auto',
      toLang: to,
      serviceName: service,
      provider,
      model,
      pending: false,
    })
    .build()
}

export function createFailedItem(
  originalText: string,
  service: string,
  featureId: string,
  detectedLang: string,
  targetLang: string,
  errorMessage?: string
) {
  const serviceName = service.charAt(0).toUpperCase() + service.slice(1)
  const originalSnippet = formatOriginalSnippet(originalText)
  const subtitle = `原文: ${originalSnippet || originalText} · ${serviceName}: ${detectedLang} → ${targetLang}${errorMessage ? ` · 错误: ${errorMessage}` : ''}`

  return new TuffItemBuilder(getTranslationItemId(originalText, service))
    .setSource('plugin', 'plugin-features')
    .setTitle(`${serviceName} 翻译失败`)
    .setSubtitle(subtitle)
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .addTag('Translation', 'red')
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      pluginType: 'translation',
      originalText,
      translatedText: '',
      fromLang: detectedLang,
      toLang: targetLang,
      serviceName: service,
      pending: false,
      error: errorMessage || 'translation failed',
    })
    .build()
}
