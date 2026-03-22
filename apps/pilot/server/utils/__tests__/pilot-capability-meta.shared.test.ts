import { describe, expect, it } from 'vitest'
import {
  createPilotDefaultCapabilities,
  getPilotModelTemplatePreset,
  isPilotRouteComboIdValid,
  normalizeThinkingFlags,
  PILOT_MODEL_TEMPLATE_PRESETS,
  resolvePilotCapabilities,
  sanitizeBuiltinToolsByCapabilities,
} from '../../../shared/pilot-capability-meta'

describe('pilot-capability-meta shared rules', () => {
  it('模板预设应生成预期能力矩阵', () => {
    const presets = new Map(PILOT_MODEL_TEMPLATE_PRESETS.map(item => [item.id, item]))
    const general = presets.get('general-chat')
    const multimodal = presets.get('multimodal-creator')
    const voice = presets.get('voice-assistant')

    expect(general).toBeTruthy()
    expect(multimodal).toBeTruthy()
    expect(voice).toBeTruthy()

    expect(general?.capabilities.websearch).toBe(true)
    expect(general?.capabilities['file.analyze']).toBe(true)
    expect(general?.capabilities['image.generate']).toBe(false)
    expect(general?.capabilities['audio.tts']).toBe(false)
    expect(general?.capabilities['video.generate']).toBe(false)

    expect(multimodal?.capabilities['image.generate']).toBe(true)
    expect(multimodal?.capabilities['audio.tts']).toBe(true)
    expect(multimodal?.capabilities['video.generate']).toBe(false)

    expect(voice?.capabilities['audio.stt']).toBe(true)
    expect(voice?.capabilities['image.generate']).toBe(false)
  })

  it('thinking 规则：不支持时必须强制关闭默认开关', () => {
    expect(normalizeThinkingFlags(false, true)).toEqual({
      thinkingSupported: false,
      thinkingDefaultEnabled: false,
    })
    expect(normalizeThinkingFlags(true, false)).toEqual({
      thinkingSupported: true,
      thinkingDefaultEnabled: false,
    })
  })

  it('websearch 关闭后应自动移除 websearch 工具', () => {
    const capabilities = createPilotDefaultCapabilities(true)
    capabilities.websearch = false
    const tools = sanitizeBuiltinToolsByCapabilities(['write_todos', 'websearch', 'ls'], capabilities)
    expect(tools).toEqual(['write_todos', 'ls'])
  })

  it('显式 capabilities 优先于 legacy 回填', () => {
    const capabilities = resolvePilotCapabilities({
      'websearch': true,
      'audio.tts': false,
      'video.generate': false,
    }, {
      allowWebsearch: false,
      allowImageGeneration: true,
      allowFileAnalysis: true,
    })

    expect(capabilities.websearch).toBe(true)
    expect(capabilities['audio.tts']).toBe(false)
    expect(capabilities['video.generate']).toBe(false)
    expect(capabilities['image.generate']).toBe(true)
    expect(capabilities['file.analyze']).toBe(true)
  })

  it('route combo 校验应识别无效值', () => {
    const routeComboIds = new Set(['default-auto', 'image-combo'])
    expect(isPilotRouteComboIdValid('', routeComboIds)).toBe(true)
    expect(isPilotRouteComboIdValid('default-auto', routeComboIds)).toBe(true)
    expect(isPilotRouteComboIdValid('legacy-combo', routeComboIds)).toBe(false)
  })

  it('可通过 id 获取模板预设', () => {
    const preset = getPilotModelTemplatePreset('research')
    expect(preset?.id).toBe('research')
    expect(preset?.thinkingSupported).toBe(true)
  })
})
