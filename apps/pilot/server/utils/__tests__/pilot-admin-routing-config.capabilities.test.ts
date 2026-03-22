import { describe, expect, it } from 'vitest'
import { resolvePilotModelCapabilities } from '../pilot-admin-routing-config'

describe('pilot-admin-routing-config capabilities', () => {
  it('会对历史 legacy 字段做能力回填', () => {
    const capabilities = resolvePilotModelCapabilities(undefined, {
      allowWebsearch: false,
      allowImageGeneration: false,
      allowFileAnalysis: false,
      allowImageAnalysis: false,
    })

    expect(capabilities.websearch).toBe(false)
    expect(capabilities['image.generate']).toBe(false)
    expect(capabilities['file.analyze']).toBe(false)
    expect(capabilities['image.edit']).toBe(true)
    expect(capabilities['audio.tts']).toBe(true)
    expect(capabilities['audio.stt']).toBe(true)
    expect(capabilities['audio.transcribe']).toBe(true)
    expect(capabilities['video.generate']).toBe(true)
  })

  it('显式 capabilities 优先于 legacy 值', () => {
    const capabilities = resolvePilotModelCapabilities({
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
  })
})
