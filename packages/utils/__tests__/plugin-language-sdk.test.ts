import { describe, expect, it, vi } from 'vitest'
import {
  createLanguageSDK,
  createPluginI18nMessage,
  formatPluginI18nKey,
  parsePluginI18nKey,
  PLUGIN_I18N_KEY_PREFIX
} from '../plugin/sdk/language'
import { PluginEvents } from '../transport/events'

describe('LanguageSDK and plugin i18n helpers', () => {
  describe('formatPluginI18nKey', () => {
    it('scopes key with plugin namespace', () => {
      expect(formatPluginI18nKey('my-plugin', 'features.search.title')).toBe(
        'plugin.my-plugin.features.search.title'
      )
    })

    it('does not double-prefix if key already contains plugin namespace', () => {
      expect(
        formatPluginI18nKey('my-plugin', 'plugin.my-plugin.features.search.title')
      ).toBe('plugin.my-plugin.features.search.title')
    })

    it('throws error if key is empty', () => {
      expect(() => formatPluginI18nKey('my-plugin', '   ')).toThrow(
        '[Language SDK] Key is required'
      )
    })
  })

  describe('parsePluginI18nKey', () => {
    it('parses valid plugin key back to pluginName and key', () => {
      const parsed = parsePluginI18nKey('plugin.my-plugin.features.search.title')
      expect(parsed).toEqual({
        pluginName: 'my-plugin',
        key: 'features.search.title'
      })
    })

    it('returns null for non-plugin keys', () => {
      expect(parsePluginI18nKey('corebox.system.actions')).toBeNull()
      expect(parsePluginI18nKey('plugin.')).toBeNull()
      expect(parsePluginI18nKey('plugin.onlyplugin')).toBeNull()
    })
  })

  describe('createPluginI18nMessage', () => {
    it('creates $i18n: message with scoped key without params', () => {
      expect(createPluginI18nMessage('my-plugin', 'hello')).toBe(
        '$i18n:plugin.my-plugin.hello'
      )
    })

    it('creates $i18n: message with parameters', () => {
      expect(
        createPluginI18nMessage('my-plugin', 'count', { total: 42 })
      ).toBe('$i18n:plugin.my-plugin.count|{"total":42}')
    })
  })

  describe('createLanguageSDK instance', () => {
    it('formats messages via t() and createMessage()', () => {
      const sdk = createLanguageSDK({ pluginName: 'demo' })
      expect(sdk.t('title')).toBe('$i18n:plugin.demo.title')
      expect(sdk.createMessage('count', { n: 1 })).toBe('$i18n:plugin.demo.count|{"n":1}')
    })

    it('fetches locale from transport', async () => {
      const mockSend = vi.fn().mockResolvedValue('zh-CN')
      const sdk = createLanguageSDK({
        pluginName: 'demo',
        transport: { send: mockSend }
      })

      const locale = await sdk.getLocale()
      expect(locale).toBe('zh-CN')
      expect(mockSend).toHaveBeenCalledWith(PluginEvents.i18n.getLocale, {})
    })

    it('resolves text via transport using $i18n: payload', async () => {
      const mockSend = vi.fn().mockResolvedValue('你好')
      const sdk = createLanguageSDK({
        pluginName: 'demo',
        transport: { send: mockSend }
      })

      const resolved = await sdk.resolve('greeting')
      expect(resolved).toBe('你好')
      expect(mockSend).toHaveBeenCalledWith(PluginEvents.i18n.resolveText, {
        value: '$i18n:plugin.demo.greeting'
      })
    })
  })
})
