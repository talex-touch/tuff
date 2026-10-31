import path from 'node:path'
import fse from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18nResolver } from '@talex-touch/utils/i18n'
import { PluginLanguageManager } from './plugin-language-manager'

describe('PluginLanguageManager', () => {
  const tmpDir = path.join('/tmp', `tuff-plugin-lang-test-${Date.now()}`)
  let manager: PluginLanguageManager

  beforeEach(async () => {
    await fse.ensureDir(tmpDir)
    manager = new PluginLanguageManager('zh-CN')
  })

  afterEach(async () => {
    manager.resetForTests()
    await fse.remove(tmpDir)
    vi.restoreAllMocks()
  })

  it('registers plugins with zero disk I/O', async () => {
    const pluginPath = path.join(tmpDir, 'test-plugin')
    const readSpy = vi.spyOn(fse, 'readJSON')
    const pathExistsSpy = vi.spyOn(fse, 'pathExists')

    manager.register('test-plugin', pluginPath)

    // No I/O should occur upon registration
    expect(readSpy).not.toHaveBeenCalled()
    expect(pathExistsSpy).not.toHaveBeenCalled()
    expect(manager.isPluginStale('test-plugin')).toBe(true)
  })

  it('marks plugin language caches stale upon app locale change with zero disk I/O', async () => {
    const pluginPath = path.join(tmpDir, 'test-plugin')
    manager.register('test-plugin', pluginPath)

    const readSpy = vi.spyOn(fse, 'readJSON')

    // Switch app locale from zh-CN to en-US
    manager.onLocaleChanged('en-US')

    expect(manager.getLocale()).toBe('en-US')
    expect(manager.isPluginStale('test-plugin')).toBe(true)
    // Absolute zero disk read
    expect(readSpy).not.toHaveBeenCalled()
  })

  it('lazily loads languages on-demand when the plugin is actually used', async () => {
    const pluginDir = path.join(tmpDir, 'calc-plugin')
    const langDir = path.join(pluginDir, 'languages')
    await fse.ensureDir(langDir)

    await fse.writeJSON(path.join(langDir, 'zh-CN.json'), {
      title: '计算器',
      actions: {
        calculate: '计算'
      }
    })
    await fse.writeJSON(path.join(langDir, 'en-US.json'), {
      title: 'Calculator',
      actions: {
        calculate: 'Calculate'
      }
    })

    manager.register('calc-plugin', pluginDir)

    // Before use, nothing is loaded
    expect(manager.getLoadedDictionary('calc-plugin', 'zh-CN')).toBeUndefined()

    // 1. First demand: ensure zh-CN
    const dict = await manager.ensurePluginLanguage('calc-plugin', 'zh-CN')
    expect(dict).toEqual({
      title: '计算器',
      actions: {
        calculate: '计算'
      }
    })
    expect(manager.isPluginStale('calc-plugin')).toBe(false)

    // 2. Resolver should now resolve the scoped message
    i18nResolver.setLocale('zh')
    const resolvedZh = await manager.resolveMessage('$i18n:plugin.calc-plugin.title')
    expect(resolvedZh).toBe('计算器')

    // 3. Switch host locale to en-US: caches become stale without disk I/O
    const readSpy = vi.spyOn(fse, 'readJSON')
    manager.onLocaleChanged('en-US')
    expect(readSpy).not.toHaveBeenCalled()
    expect(manager.isPluginStale('calc-plugin')).toBe(true)

    // 4. Second demand: someone needs calc-plugin in en-US
    i18nResolver.setLocale('en')
    const resolvedEn = await manager.resolveMessage('$i18n:plugin.calc-plugin.title', 'en-US')
    expect(resolvedEn).toBe('Calculator')
    expect(manager.isPluginStale('calc-plugin')).toBe(false)
  })

  it('deduplicates concurrent loads via single-flight', async () => {
    const pluginDir = path.join(tmpDir, 'shared-plugin')
    const langDir = path.join(pluginDir, 'languages')
    await fse.ensureDir(langDir)
    await fse.writeJSON(path.join(langDir, 'zh-CN.json'), { greeting: '你好' })

    manager.register('shared-plugin', pluginDir)

    const readSpy = vi.spyOn(fse, 'readJSON')

    // Trigger 5 concurrent requests for the same plugin
    const results = await Promise.all([
      manager.ensurePluginLanguage('shared-plugin', 'zh-CN'),
      manager.ensurePluginLanguage('shared-plugin', 'zh-CN'),
      manager.ensurePluginLanguage('shared-plugin', 'zh-CN'),
      manager.ensurePluginLanguage('shared-plugin', 'zh-CN'),
      manager.ensurePluginLanguage('shared-plugin', 'zh-CN')
    ])

    for (const r of results) {
      expect(r).toEqual({ greeting: '你好' })
    }

    // Only one single readJSON was executed
    expect(readSpy).toHaveBeenCalledTimes(1)
  })

  it('falls back to alternate language file when exact locale is missing', async () => {
    const pluginDir = path.join(tmpDir, 'fallback-plugin')
    const langDir = path.join(pluginDir, 'languages')
    await fse.ensureDir(langDir)
    // Only en.json is provided
    await fse.writeJSON(path.join(langDir, 'en.json'), { fallbackText: 'Hello Fallback' })

    manager.register('fallback-plugin', pluginDir)

    // Demanded zh-CN, but plugin only has en.json
    const dict = await manager.ensurePluginLanguage('fallback-plugin', 'zh-CN')
    expect(dict).toEqual({ fallbackText: 'Hello Fallback' })

    // Resolves smoothly
    i18nResolver.setLocale('zh')
    const text = await manager.resolveMessage('$i18n:plugin.fallback-plugin.fallbackText')
    expect(text).toBe('Hello Fallback')
  })
})
