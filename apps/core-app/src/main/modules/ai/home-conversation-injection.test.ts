import type { IntelligenceInvokeOptions } from '@talex-touch/utils/types/intelligence'
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

const chatPayload = () => ({ messages: [{ role: 'user' as const, content: 'hello' }] })

describe('applyHomeConversationInjection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    injectionMocks.buildHomeInjection.mockResolvedValue('SKILLS AND RULES')
  })

  it('prepends the imported skills and rules as a leading system message', async () => {
    const payload = chatPayload()

    const result = await applyHomeConversationInjection(payload, homeOptions(true), false)

    expect(result).toEqual({
      messages: [
        { role: 'system', content: 'SKILLS AND RULES' },
        { role: 'user', content: 'hello' }
      ]
    })
    // The caller's payload is replaced, not mutated: a retry reuses the same object.
    expect(payload.messages).toHaveLength(1)
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

  it('leaves the payload untouched when nothing is active or the payload is not a chat', async () => {
    const payload = chatPayload()
    injectionMocks.buildHomeInjection.mockResolvedValue(null)

    await expect(applyHomeConversationInjection(payload, homeOptions(true), false)).resolves.toBe(
      payload
    )

    const notAChat = { text: 'summarise this' }
    await expect(applyHomeConversationInjection(notAChat, homeOptions(true), false)).resolves.toBe(
      notAChat
    )
    expect(injectionMocks.buildHomeInjection).toHaveBeenCalledTimes(1)
  })
})
