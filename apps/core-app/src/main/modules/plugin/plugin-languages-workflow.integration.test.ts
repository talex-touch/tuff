import path from 'node:path'
import fse from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18nResolver } from '@talex-touch/utils/i18n'
import { createLanguageSDK } from '@talex-touch/utils/plugin/sdk/language'
import type { Translate } from '../../../renderer/src/modules/lang/useI18nText'
import { resolveI18nText } from '../../../renderer/src/modules/lang/resolve-i18n-text'
import { PluginLanguageManager } from './plugin-language-manager'

describe('Plugin Languages Full Workflow (E2E Integration)', () => {
  const tmpDir = path.join('/tmp', `plugin-workflow-test-${Date.now()}`)
  const pluginDir = path.join(tmpDir, 'weather-plugin')
  const langDir = path.join(pluginDir, 'languages')
  let manager: PluginLanguageManager

  beforeEach(async () => {
    await fse.ensureDir(langDir)

    // 1. Plugin provides languages directory
    await fse.writeJSON(path.join(langDir, 'zh-CN.json'), {
      currentWeather: '当前天气',
      temperature: '温度：{temp}度'
    })
    await fse.writeJSON(path.join(langDir, 'en-US.json'), {
      currentWeather: 'Current Weather',
      temperature: 'Temperature: {temp}°C'
    })

    manager = new PluginLanguageManager('zh-CN')
    PluginLanguageManager.setInstanceForTests(manager)
  })

  afterEach(async () => {
    manager.resetForTests()
    PluginLanguageManager.setInstanceForTests(null)
    await fse.remove(tmpDir)
    vi.restoreAllMocks()
  })

  it('verifies the full lifecycle of plugin languages and on-demand reloading', async () => {
    const readSpy = vi.spyOn(fse, 'readJSON')

    // 1. Plugin registered at startup - ZERO DISK I/O
    manager.register('weather-plugin', pluginDir)
    expect(readSpy).not.toHaveBeenCalled()
    expect(manager.isPluginStale('weather-plugin')).toBe(true)

    // 2. Plugin uses LanguageSDK to create messages for transport
    const pluginSdk = createLanguageSDK({ pluginName: 'weather-plugin' })
    const transportTitle = pluginSdk.t('currentWeather')
    const transportTemp = pluginSdk.t('temperature', { temp: 25 })

    expect(transportTitle).toBe('$i18n:plugin.weather-plugin.currentWeather')
    expect(transportTemp).toBe('$i18n:plugin.weather-plugin.temperature|{"temp":25}')

    // 3. User switches main application language to en-US - ZERO DISK I/O
    manager.onLocaleChanged('en-US')
    expect(readSpy).not.toHaveBeenCalled()
    expect(manager.isPluginStale('weather-plugin')).toBe(true)

    // 4. Plugin is needed: CoreBox or host resolves the message in en-US
    const enTitle = await manager.resolveMessage(transportTitle, 'en-US')
    expect(enTitle).toBe('Current Weather')
    expect(readSpy).toHaveBeenCalledTimes(1)
    expect(manager.isPluginStale('weather-plugin')).toBe(false)

    // 5. Renderer resolveI18nText consumes the $i18n: message seamlessly
    const mockVueT: Translate = (key: string) => key
    const renderedTitle = resolveI18nText(transportTitle, mockVueT)
    expect(renderedTitle).toBe('Current Weather')

    const renderedTemp = resolveI18nText(transportTemp, mockVueT)
    expect(renderedTemp).toBe('Temperature: 25°C')

    // 6. User switches back to zh-CN - ZERO DISK I/O
    manager.onLocaleChanged('zh-CN')
    expect(readSpy).toHaveBeenCalledTimes(1) // Still 1, no new reads
    expect(manager.isPluginStale('weather-plugin')).toBe(true)

    // 7. Plugin is accessed again in zh-CN -> lazily loads zh-CN.json
    const zhTitle = await manager.resolveMessage(transportTitle, 'zh-CN')
    expect(zhTitle).toBe('当前天气')
    expect(readSpy).toHaveBeenCalledTimes(2) // Now read zh-CN.json
    expect(manager.isPluginStale('weather-plugin')).toBe(false)

    const renderedZhTitle = resolveI18nText(transportTitle, mockVueT)
    expect(renderedZhTitle).toBe('当前天气')
  })
})
