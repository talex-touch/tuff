import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import enBase from '../../i18n/locales/en'
import enStore from '../../i18n/locales/route/en/store'
import zhStore from '../../i18n/locales/route/zh/store'
import zhBase from '../../i18n/locales/zh'
import { pageSearchItems } from '~/data/search/pageIndex'
import { resolveRouteLocaleChunks } from './route-locale-chunks'

const nexusRoot = join(import.meta.dirname, '../..')

function mergeMessages(base: Record<string, any>, extra: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...base }
  for (const [key, value] of Object.entries(extra)) {
    const existing = out[key]
    if (
      existing && typeof existing === 'object' && !Array.isArray(existing)
      && value && typeof value === 'object' && !Array.isArray(value)
    ) {
      out[key] = mergeMessages(existing, value)
    }
    else {
      out[key] = value
    }
  }
  return out
}

function hasMessageKey(messages: Record<string, any>, key: string): boolean {
  let cursor: any = messages
  for (const segment of key.split('.')) {
    if (!cursor || typeof cursor !== 'object' || !(segment in cursor))
      return false
    cursor = cursor[segment]
  }
  return cursor !== undefined
}

function collectFiles(target: string): string[] {
  if (!existsSync(target))
    return []
  if (!statSync(target).isDirectory())
    return [target]
  return readdirSync(target).flatMap(entry => collectFiles(join(target, entry)))
}

function extractStaticTranslationKeys(source: string): string[] {
  const keys = new Set<string>()
  const pattern = /(?<![\w.$])\$?t\(\s*['"]([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+)['"]/g
  for (const match of source.matchAll(pattern)) {
    if (match[1])
      keys.add(match[1])
  }
  return Array.from(keys)
}

describe('route-locale-chunks store split', () => {
  it('maps /store routes to the dedicated store locale chunk instead of dashboard', () => {
    expect(resolveRouteLocaleChunks('/store')).toEqual(['store'])
    expect(resolveRouteLocaleChunks('/zh/store')).toEqual(['store'])
    expect(resolveRouteLocaleChunks('/en/store/my-plugin')).toEqual(['store'])
    expect(resolveRouteLocaleChunks('/store')).not.toContain('dashboard')
  })

  it('keeps dashboard, landing, and non-chunked route mappings intact', () => {
    expect(resolveRouteLocaleChunks('/dashboard')).toEqual(['dashboard'])
    expect(resolveRouteLocaleChunks('/zh/dashboard/plugins')).toEqual(['dashboard'])
    expect(resolveRouteLocaleChunks('/admin/overview')).toEqual(['dashboard'])
    expect(resolveRouteLocaleChunks('/team/join')).toEqual(['dashboard'])
    expect(resolveRouteLocaleChunks('/')).toEqual(['landing'])
    expect(resolveRouteLocaleChunks('/docs/dev/components/button')).toEqual([])
  })

  it('provides every static i18n key used by /store pages, layout, and store components without dashboard chunk', () => {
    // Mirrors `ensureRouteLocaleChunk`: `composer.mergeLocaleMessage(locale, { [chunk]: messages })`
    const enMessages = mergeMessages(enBase as Record<string, any>, { store: enStore as Record<string, any> })
    const zhMessages = mergeMessages(zhBase as Record<string, any>, { store: zhStore as Record<string, any> })

    const storeTargets = [
      join(nexusRoot, 'app/pages/store.vue'),
      join(nexusRoot, 'app/layouts/store.vue'),
      join(nexusRoot, 'app/components/store'),
      join(nexusRoot, 'app/components/plugin/PluginMetaHeader.vue'),
      join(nexusRoot, 'app/composables/useStoreCategories.ts'),
      join(nexusRoot, 'app/composables/useStorePlugins.ts'),
    ]

    const files = storeTargets
      .flatMap(collectFiles)
      .filter(file => /\.(?:vue|ts)$/.test(file) && !file.endsWith('.test.ts'))

    expect(files.length).toBeGreaterThan(3)

    const missingEn: string[] = []
    const missingZh: string[] = []
    const forbiddenDashboardRefs: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const keys = extractStaticTranslationKeys(source)
      for (const key of keys) {
        if (key.startsWith('dashboard.'))
          forbiddenDashboardRefs.push(`${file}: ${key}`)
        if (!hasMessageKey(enMessages, key))
          missingEn.push(`${file}: ${key}`)
        if (!hasMessageKey(zhMessages, key))
          missingZh.push(`${file}: ${key}`)
      }
    }

    expect(forbiddenDashboardRefs).toEqual([])
    expect(missingEn).toEqual([])
    expect(missingZh).toEqual([])
  })

  it('resolves every global search pageIndex titleKey and descriptionKey in base en and zh locales', () => {
    const missingEn: string[] = []
    const missingZh: string[] = []

    for (const item of pageSearchItems) {
      const keys = [item.titleKey, ...(item.descriptionKey ? [item.descriptionKey] : [])]
      for (const key of keys) {
        if (!hasMessageKey(enBase as Record<string, any>, key))
          missingEn.push(`${item.id}: ${key}`)
        if (!hasMessageKey(zhBase as Record<string, any>, key))
          missingZh.push(`${item.id}: ${key}`)
      }
    }

    expect(pageSearchItems.length).toBeGreaterThan(0)
    expect(missingEn).toEqual([])
    expect(missingZh).toEqual([])
  })
})
