import { describe, expect, it } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

const translationPlugin = loadPluginModule(
  new URL('../../../../plugins/touch-translation/index.js', import.meta.url),
  createPluginGlobals(),
)
const { __test: translationTest } = translationPlugin

describe('touch-translation shared helpers', () => {
  it('detects target language from input text', () => {
    expect(translationTest.detectLanguage('你好，世界')).toBe('zh')
    expect(translationTest.resolveTargetLanguage('你好，世界')).toBe('en')
    expect(translationTest.resolveTargetLanguage('hello world')).toBe('zh')
  })

  it('normalizes enabled providers by shared order and supported set', () => {
    const enabledProviders = translationTest.getEnabledProviderIds(
      {
        deepl: { enabled: true },
        google: { enabled: true },
        tuffintelligence: { enabled: true },
      },
      {
        supportedIds: ['google', 'tuffintelligence'],
      },
    )

    expect(enabledProviders).toEqual(['tuffintelligence', 'google'])
  })

  it('falls back to default fast providers when saved config has no supported provider', () => {
    const enabledProviders = translationTest.getEnabledProviderIds(
      {
        deepl: { enabled: true },
      },
      {
        supportedIds: ['google', 'tuffintelligence'],
      },
    )

    expect(enabledProviders).toEqual(['tuffintelligence', 'google'])
  })

  it('normalizes translation failure messages', () => {
    expect(translationTest.normalizeCallFailureMessage('')).toBe('调用失败：翻译服务暂不可用，请稍后重试')
    expect(translationTest.normalizeErrorMessage('permission denied')).toBe('权限被拒绝：请在插件设置中授予所需权限后重试')
    expect(translationTest.normalizeErrorMessage('无输入：')).toBe('无输入：请输入要翻译的文本')
  })
})
