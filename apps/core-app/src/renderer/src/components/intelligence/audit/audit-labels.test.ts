import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BUILTIN_CHANNEL_LABEL_KEYS,
  buildPluginCallerNames,
  CORE_CALLER_LABEL_KEYS,
  HOME_OPERATION_LABEL_KEYS,
  resolveCallerLabel,
  resolveCapabilityLabel,
  resolveChannelLabel,
  USAGE_LIMIT_LABEL_KEYS,
  usageLimitLabelKey
} from './audit-labels'

const t = (key: string) => `t:${key}`

const CHANNELS = [
  { id: 'custom-1759', name: 'SiliconFlow 国内', type: 'custom' },
  { id: 'ollama-local', name: '', type: 'local' }
]

describe('channel names', () => {
  it('names a channel the way the reader named it', () => {
    expect(resolveChannelLabel('custom-1759', CHANNELS, t)).toEqual({
      id: 'custom-1759',
      name: 'SiliconFlow 国内',
      deleted: false,
      legacyType: false
    })
    // An unnamed channel still says which one it is.
    expect(resolveChannelLabel('ollama-local', CHANNELS, t).name).toBe('ollama-local')
  })

  it('names a bare channel type, which older rows recorded instead of the channel', () => {
    expect(resolveChannelLabel('anthropic', CHANNELS, t)).toEqual({
      id: 'anthropic',
      name: 't:settings.intelligence.providerTypeOptions.anthropic',
      deleted: false,
      legacyType: true
    })
  })

  it('names the channels the main process adds at run time, which no stored list carries', () => {
    expect(resolveChannelLabel('local-system-ocr', CHANNELS, t)).toEqual({
      id: 'local-system-ocr',
      name: 't:intelligenceAudit.channels.systemOcr',
      deleted: false,
      legacyType: false,
      builtin: true
    })
    expect(resolveChannelLabel('pi-cli-default', CHANNELS, t).name).toBe(
      't:intelligenceAudit.channels.piCli'
    )
    expect(resolveChannelLabel('claude-cli', CHANNELS, t).deleted).toBe(false)
  })

  it('marks an id no channel carries any more as deleted, keeping the id', () => {
    expect(resolveChannelLabel('custom-gone', CHANNELS, t)).toEqual({
      id: 'custom-gone',
      name: 't:intelligenceAudit.channels.deleted',
      deleted: true,
      legacyType: false
    })
    // Inherited object keys are not channel types.
    expect(resolveChannelLabel('toString', CHANNELS, t).deleted).toBe(true)
  })
})

describe('caller names', () => {
  const plugins = buildPluginCallerNames([
    { name: 'touch-translation', displayName: '翻译' },
    { name: 'touch-raw' },
    { name: 'a:b', displayName: 'Colon plugin' }
  ])

  it('matches an installed plugin on the whole id the host binds, never on a piece of it', () => {
    expect(resolveCallerLabel('plugin:touch-translation', null, plugins, t)).toEqual({
      label: '翻译',
      kind: 'plugin'
    })
    expect(resolveCallerLabel('plugin:touch-raw', null, plugins, t).label).toBe('touch-raw')
    // A plugin name containing the separator still matches whole…
    expect(resolveCallerLabel('plugin:a:b', null, plugins, t).label).toBe('Colon plugin')
    // …and an id that merely starts like an installed plugin's is not taken apart to fit one.
    expect(resolveCallerLabel('plugin:touch-translation:extra', null, plugins, t)).toEqual({
      label: 'plugin:touch-translation:extra',
      kind: 'unknown'
    })
    expect(resolveCallerLabel('plugin:uninstalled', null, plugins, t)).toEqual({
      label: 'plugin:uninstalled',
      kind: 'unknown'
    })
  })

  it('names the built-in callers, with system as the capability test', () => {
    expect(resolveCallerLabel('system', null, plugins, t)).toEqual({
      label: 't:intelligenceAudit.callers.capabilityTest',
      kind: 'core'
    })
    expect(resolveCallerLabel('ai-cli-orchestrator', null, plugins, t).label).toBe(
      't:intelligenceAudit.callers.agentRuntime'
    )
    expect(resolveCallerLabel('core.files.embedding', null, plugins, t).label).toBe(
      't:intelligenceAudit.callers.fileEmbedding'
    )
  })

  it('splits rows without a caller by their Home operation, and the rest into 应用内其他', () => {
    expect(resolveCallerLabel('', 'home-conversation', plugins, t)).toEqual({
      label: 't:intelligenceAudit.callers.homeConversation',
      kind: 'home'
    })
    expect(resolveCallerLabel('', 'conversation-title', plugins, t).label).toBe(
      't:intelligenceAudit.callers.conversationTitle'
    )
    expect(resolveCallerLabel('', 'home-opening', plugins, t).label).toBe(
      't:intelligenceAudit.callers.homeOpening'
    )
    expect(resolveCallerLabel('', 'something-else', plugins, t)).toEqual({
      label: 't:intelligenceAudit.callers.inApp',
      kind: 'in-app'
    })
    expect(resolveCallerLabel('', undefined, plugins, t).kind).toBe('in-app')
  })
})

describe('capability names', () => {
  it('uses the capability label, and the id when there is none', () => {
    const capabilities = { 'text.chat': { label: '对话' }, 'image.ocr': {} }
    expect(resolveCapabilityLabel('text.chat', capabilities)).toBe('对话')
    expect(resolveCapabilityLabel('image.ocr', capabilities)).toBe('image.ocr')
    expect(resolveCapabilityLabel('missing', capabilities)).toBe('missing')
  })
})

describe('usage limit names', () => {
  it('names each of the six limits, and nothing it does not know', () => {
    expect(Object.keys(USAGE_LIMIT_LABEL_KEYS).sort()).toEqual(
      [
        'costUsdPerDay',
        'costUsdPerMonth',
        'requestsPerDay',
        'requestsPerMonth',
        'tokensPerDay',
        'tokensPerMonth'
      ].sort()
    )
    expect(usageLimitLabelKey('requestsPerDay')).toBe(
      'intelligenceAudit.limits.items.requestsPerDay'
    )
    expect(usageLimitLabelKey('requestsPerFortnight')).toBeNull()
    expect(usageLimitLabelKey('toString')).toBeNull()
  })
})

describe('label keys', () => {
  /**
   * These keys are handed to `t()` through a table, which the translation-coverage scan cannot
   * see; a key missing from a locale would render as the key itself.
   */
  it('exist in both locales', () => {
    const langDir = path.resolve(__dirname, '../../../modules/lang')
    const flatten = (value: Record<string, unknown>, prefix = ''): Set<string> => {
      const keys = new Set<string>()
      for (const [key, child] of Object.entries(value)) {
        const full = prefix ? `${prefix}.${key}` : key
        if (child && typeof child === 'object' && !Array.isArray(child)) {
          for (const nested of flatten(child as Record<string, unknown>, full)) keys.add(nested)
        } else keys.add(full)
      }
      return keys
    }
    const locales = ['zh-CN', 'en-US'].map((name) =>
      flatten(JSON.parse(readFileSync(path.join(langDir, `${name}.json`), 'utf8')))
    )
    const keys = [
      ...Object.values(CORE_CALLER_LABEL_KEYS),
      ...Object.values(HOME_OPERATION_LABEL_KEYS),
      ...Object.values(USAGE_LIMIT_LABEL_KEYS),
      ...Object.values(BUILTIN_CHANNEL_LABEL_KEYS),
      'intelligenceAudit.callers.inApp',
      'intelligenceAudit.channels.deleted',
      ...['openai', 'anthropic', 'deepseek', 'siliconflow', 'local'].map(
        (type) => `settings.intelligence.providerTypeOptions.${type}`
      ),
      'settings.intelligence.custom'
    ]
    // Positive control: a flattening that found nothing would make every check below vacuous.
    expect(locales[0]!.size).toBeGreaterThan(4000)
    for (const locale of locales) {
      for (const key of keys) expect(locale.has(key), key).toBe(true)
    }
  })
})
