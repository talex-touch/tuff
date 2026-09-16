import { describe, expect, it } from 'vitest'
import { getVoicePolishPrompt, wrapTranscription } from './polish-prompt'

describe('polish-prompt', () => {
  describe('getVoicePolishPrompt', () => {
    it('provides prompt with ITN rules for all polish strengths', () => {
      for (const strength of ['natural', 'structured', 'deep'] as const) {
        const prompt = getVoicePolishPrompt(strength)
        expect(prompt).toContain('Inverse text normalization (ITN)')
        expect(prompt).toContain('十五块')
        expect(prompt).toContain('15块')
        expect(prompt).toContain('一清二楚')
      }
    })

    it('provides disfluency and filler filtering instructions', () => {
      const prompt = getVoicePolishPrompt('natural')
      expect(prompt).toContain('meaningless fillers')
      expect(prompt).toContain('呃')
      expect(prompt).toContain('那个')
      expect(prompt).toContain('就是说')
      expect(prompt).toContain('um')
    })

    it('provides target application context guidance', () => {
      const prompt = getVoicePolishPrompt('natural')
      expect(prompt).toContain('Target application context')
      expect(prompt).toContain('Code editors and terminals')
      expect(prompt).toContain('Messaging and chat apps')
      expect(prompt).toContain('Document and email tools')
    })

    it('differentiates editing strengths', () => {
      const natural = getVoicePolishPrompt('natural')
      const structured = getVoicePolishPrompt('structured')
      const deep = getVoicePolishPrompt('deep')

      expect(natural).toContain('Editing strength: NATURAL')
      expect(structured).toContain('Editing strength: STRUCTURED')
      expect(deep).toContain('Editing strength: DEEP')

      expect(natural).toContain('Keep the original wording and sequence')
      expect(structured).toContain('group related points')
      expect(deep).toContain('Treat the whole transcript as a rough draft')
    })
  })

  describe('wrapTranscription', () => {
    it('wraps raw transcript in a valid JSON string', () => {
      const raw = '明天下午三点开会'
      const wrapped = wrapTranscription(raw)
      const parsed = JSON.parse(wrapped)

      expect(parsed).toEqual({ transcription: raw })
    })

    it('injects application context when provided', () => {
      const raw = 'const totalCount = 100'
      const wrapped = wrapTranscription(raw, {
        appName: 'Visual Studio Code',
        category: 'code-editor',
        windowTitle: 'polish-prompt.ts - talex-touch'
      })
      const parsed = JSON.parse(wrapped)

      expect(parsed).toEqual({
        transcription: raw,
        targetApp: 'Visual Studio Code',
        targetCategory: 'code-editor',
        windowTitle: 'polish-prompt.ts - talex-touch'
      })
    })

    it('accepts targetApp fallback when appName is omitted', () => {
      const wrapped = wrapTranscription('你好', {
        targetApp: 'WeChat',
        category: 'chat-messaging'
      })
      const parsed = JSON.parse(wrapped)

      expect(parsed).toEqual({
        transcription: '你好',
        targetApp: 'WeChat',
        targetCategory: 'chat-messaging'
      })
    })
  })
})
