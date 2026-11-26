import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions
} from '@talex-touch/utils/types/intelligence'
import { INTELLIGENCE_HOME_SURFACE } from '@talex-touch/utils/types/intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const injectionMocks = vi.hoisted(() => ({
  buildHomeInjection: vi.fn<() => Promise<string | null>>(async () => 'SKILLS AND RULES')
}))

vi.mock('./ai-imported-config-runtime', () => ({
  aiImportedConfigRuntime: { buildHomeInjection: injectionMocks.buildHomeInjection }
}))

import { applyHomeConversationInjection } from './home-conversation-injection'

const homeOptions = (autoContext: boolean): IntelligenceInvokeOptions => ({
  metadata: { surface: INTELLIGENCE_HOME_SURFACE, autoContext }
})

const chatPayload = (): IntelligenceChatPayload => ({
  messages: [{ role: 'user', content: 'hello' }]
})

describe('applyHomeConversationInjection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    injectionMocks.buildHomeInjection.mockResolvedValue('SKILLS AND RULES')
  })

  it('prepends the imported skills and rules as a leading system message', async () => {
    const payload = chatPayload()

    const result = await applyHomeConversationInjection(payload, homeOptions(true), false)

    const systemContent = (result.messages[0]?.content ?? '') as string
    expect(result.messages[0]?.role).toBe('system')
    expect(systemContent).toContain('SKILLS AND RULES')
    expect(systemContent).toContain('exact opening line is ```openui')
    expect(systemContent.indexOf('SKILLS AND RULES')).toBeLessThan(
      systemContent.indexOf('exact opening line is ```openui')
    )
    // The caller's payload is replaced, not mutated: a retry reuses the same object.
    expect(payload.messages).toHaveLength(1)
  })

  /**
   * A Home thread that opens with the assistant's greeting leads with its own system note. Stacked,
   * the two would reach backends that take one system prompt — Anthropic behind Tuff Nexus — as a
   * second system message they reject on every turn.
   */
  it('folds into a leading system message the caller supplied, keeping one system prompt', async () => {
    const payload: IntelligenceChatPayload = {
      messages: [
        { role: 'system', content: 'OPENING NOTE' },
        { role: 'user', content: 'hello' }
      ]
    }

    const result = await applyHomeConversationInjection(payload, homeOptions(true), false)

    const systemContent = (result.messages[0]?.content ?? '') as string
    expect(result.messages[0]?.role).toBe('system')
    expect(systemContent).toContain('SKILLS AND RULES')
    expect(systemContent).toContain('exact opening line is ```openui')
    expect(systemContent).toContain('OPENING NOTE')
    expect(systemContent.indexOf('SKILLS AND RULES')).toBeLessThan(
      systemContent.indexOf('exact opening line is ```openui')
    )
    expect(systemContent.indexOf('exact opening line is ```openui')).toBeLessThan(
      systemContent.indexOf('OPENING NOTE')
    )
    expect(payload.messages[0]).toEqual({ role: 'system', content: 'OPENING NOTE' })
  })

  it('leaves the payload untouched when auto context is off', async () => {
    const payload = chatPayload()

    await expect(applyHomeConversationInjection(payload, homeOptions(false), false)).resolves.toBe(
      payload
    )
    expect(injectionMocks.buildHomeInjection).not.toHaveBeenCalled()
  })

  it('ignores a forged surface marker from a plugin caller', async () => {
    const payload = chatPayload()

    await expect(applyHomeConversationInjection(payload, homeOptions(true), true)).resolves.toBe(
      payload
    )
    expect(injectionMocks.buildHomeInjection).not.toHaveBeenCalled()
  })

  it('leaves every other surface alone, including requests with no options at all', async () => {
    const payload = chatPayload()

    await expect(applyHomeConversationInjection(payload, undefined, false)).resolves.toBe(payload)
    await expect(
      applyHomeConversationInjection(payload, { metadata: { autoContext: true } }, false)
    ).resolves.toBe(payload)
    expect(injectionMocks.buildHomeInjection).not.toHaveBeenCalled()
  })

  it('injects OpenUI even when no skills are active, but leaves non-chat payloads untouched', async () => {
    const payload = chatPayload()
    injectionMocks.buildHomeInjection.mockResolvedValue(null)

    const result = await applyHomeConversationInjection(payload, homeOptions(true), false)
    expect(result).not.toBe(payload)
    expect(result.messages[0]?.role).toBe('system')
    expect(result.messages[0]?.content).toContain('exact opening line is ```openui')
    expect(result.messages[0]?.content).not.toContain('SKILLS AND RULES')

    const notAChat = { text: 'summarise this' }
    await expect(applyHomeConversationInjection(notAChat, homeOptions(true), false)).resolves.toBe(
      notAChat
    )
    expect(injectionMocks.buildHomeInjection).toHaveBeenCalledTimes(1)
  })

  it('appends the compact TDS visual artifact prompt only when the latest user turn asks for UI/HTML/SVG design output', async () => {
    const enDesignPayload: IntelligenceChatPayload = {
      messages: [
        { role: 'system', content: 'OPENING NOTE' },
        { role: 'user', content: 'Build a standalone HTML dashboard mockup with dark mode' }
      ]
    }
    const enResult = await applyHomeConversationInjection(enDesignPayload, homeOptions(true), false)
    const enSystem = enResult.messages[0]?.content ?? ''
    expect(enSystem).toContain('[TDS Visual Artifact Contract]')
    expect(enSystem).toContain('#141414')
    expect(enSystem.indexOf('SKILLS AND RULES')).toBeLessThan(
      enSystem.indexOf('exact opening line is ```openui')
    )
    expect(enSystem.indexOf('exact opening line is ```openui')).toBeLessThan(
      enSystem.indexOf('[TDS Visual Artifact Contract]')
    )
    expect(enSystem.indexOf('[TDS Visual Artifact Contract]')).toBeLessThan(
      enSystem.indexOf('OPENING NOTE')
    )

    const zhDesignPayload: IntelligenceChatPayload = {
      messages: [{ role: 'user', content: '帮我画一个 SVG 架构图和产品落地页原型' }]
    }
    injectionMocks.buildHomeInjection.mockResolvedValue(null)
    const zhResult = await applyHomeConversationInjection(zhDesignPayload, homeOptions(true), false)
    expect(zhResult.messages[0]?.content).toContain('[TDS Visual Artifact Contract]')
    expect(zhResult.messages[0]?.content).not.toContain('SKILLS AND RULES')
  })

  it('omits the TDS visual artifact prompt on normal prompts and non-design follow-up turns', async () => {
    const normalPayload: IntelligenceChatPayload = {
      messages: [{ role: 'user', content: 'How do I rebase a git branch onto origin/master?' }]
    }
    const normalResult = await applyHomeConversationInjection(
      normalPayload,
      homeOptions(true),
      false
    )
    expect(normalResult.messages[0]?.content).not.toContain('[TDS Visual Artifact Contract]')

    const followUpPayload: IntelligenceChatPayload = {
      messages: [
        { role: 'user', content: 'Create an HTML landing page prototype' },
        { role: 'assistant', content: '```html\n<main>Landing</main>\n```' },
        { role: 'user', content: 'Thanks! Now explain how HTTP/2 multiplexing works.' }
      ]
    }
    const followUpResult = await applyHomeConversationInjection(
      followUpPayload,
      homeOptions(true),
      false
    )
    expect(followUpResult.messages[0]?.content).not.toContain('[TDS Visual Artifact Contract]')

    // Plugin callers still stay blocked even when user text matches design intent.
    const forgedPayload: IntelligenceChatPayload = {
      messages: [{ role: 'user', content: 'Build an HTML landing page mockup' }]
    }
    await expect(
      applyHomeConversationInjection(forgedPayload, homeOptions(true), true)
    ).resolves.toBe(forgedPayload)
  })
})
