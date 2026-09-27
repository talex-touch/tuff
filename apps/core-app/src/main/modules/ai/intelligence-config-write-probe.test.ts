import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  describeIntelligenceWriteRegression,
  type IntelligenceWriteRegression,
  reportIntelligenceWriteRegression
} from './intelligence-config-write-probe'

const probeLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => {
    const buildLogger = (): Record<string, unknown> => ({
      info: probeLog.info,
      warn: probeLog.warn,
      debug: probeLog.debug,
      error: vi.fn(),
      success: vi.fn(),
      child: vi.fn(() => buildLogger()),
      time: vi.fn(() => ({ end: vi.fn(), split: vi.fn() }))
    })

    return buildLogger()
  })
}))

/** The id main owns and no surface offers; see `@talex-touch/utils/intelligence/voice-asr`. */
const ON_DEVICE_PROVIDER_ID = 'tuff-local-asr'

/** A write that claims the base version it was made from, so it can be judged as stale. */
const VERSIONED = { clientVersion: 7, serverVersion: 12 }

interface ProbeProvider {
  id: string
  metadata?: Record<string, unknown>
}

function provider(id: string, metadata?: Record<string, unknown>): ProbeProvider {
  return metadata ? { id, metadata } : { id }
}

function binding(providerId: string, enabled?: boolean): { providerId: string; enabled?: boolean } {
  return enabled === undefined ? { providerId } : { providerId, enabled }
}

/** A stored Intelligence document, shaped like the one a renderer write replaces. */
function intelligenceDocument(
  providers: ProbeProvider[],
  capabilities: Record<string, Array<{ providerId: string; enabled?: boolean }>>
) {
  return {
    version: 2,
    providers,
    capabilities: Object.fromEntries(
      Object.entries(capabilities).map(([capability, bindings]) => [
        capability,
        { providers: bindings }
      ])
    )
  }
}

function regressionFixture(
  overrides: Partial<IntelligenceWriteRegression> = {}
): IntelligenceWriteRegression {
  return {
    clientVersion: 7,
    serverVersion: 12,
    unconditional: false,
    droppedProviderIds: ['alpha'],
    droppedLiveBindingKeys: ['text.chat/alpha'],
    droppedIdleBindingKeys: [],
    disabledBindingKeys: [],
    programOwnedLosses: [],
    providerCount: { before: 3, after: 1 },
    bindingCount: { before: 4, after: 1 },
    ...overrides
  }
}

describe('describeIntelligenceWriteRegression', () => {
  it('reports a dropped binding that was bound and enabled as a live drop', () => {
    const previous = intelligenceDocument([provider('alpha'), provider('beta')], {
      'text.chat': [binding('alpha', true), binding('beta', true)]
    })
    const incoming = intelligenceDocument([provider('alpha'), provider('beta')], {
      'text.chat': [binding('alpha', true)]
    })

    const regression = describeIntelligenceWriteRegression(previous, incoming, VERSIONED)

    expect(regression?.droppedLiveBindingKeys).toEqual(['text.chat/beta'])
    expect(regression?.droppedIdleBindingKeys).toEqual([])
    expect(regression?.disabledBindingKeys).toEqual([])
    expect(regression?.bindingCount).toEqual({ before: 2, after: 1 })
  })

  it('reports a dropped binding that was switched off as an idle drop, not a live one', () => {
    const previous = intelligenceDocument([provider('alpha'), provider('beta')], {
      'text.chat': [binding('alpha', true), binding('beta', false)]
    })
    const incoming = intelligenceDocument([provider('alpha'), provider('beta')], {
      'text.chat': [binding('alpha', true)]
    })

    const regression = describeIntelligenceWriteRegression(previous, incoming, VERSIONED)

    expect(regression?.droppedIdleBindingKeys).toEqual(['text.chat/beta'])
    expect(regression?.droppedLiveBindingKeys).toEqual([])
  })

  it('names each half only in its own list when one write drops both', () => {
    const previous = intelligenceDocument([provider('alpha'), provider('beta')], {
      'text.chat': [binding('alpha', true), binding('beta', false)]
    })
    const incoming = intelligenceDocument([provider('alpha'), provider('beta')], {
      'text.chat': []
    })

    const regression = describeIntelligenceWriteRegression(previous, incoming, VERSIONED)

    expect(regression?.droppedLiveBindingKeys).toEqual(['text.chat/alpha'])
    expect(regression?.droppedIdleBindingKeys).toEqual(['text.chat/beta'])
    expect(regression?.disabledBindingKeys).toEqual([])
    expect(regression?.bindingCount).toEqual({ before: 2, after: 0 })
  })

  it('reports a dropped provider as a regression without calling an ordinary provider program-owned', () => {
    const previous = intelligenceDocument([provider('alpha'), provider('beta')], {
      'text.chat': [binding('alpha'), binding('beta')]
    })
    const incoming = intelligenceDocument([provider('alpha')], { 'text.chat': [binding('alpha')] })

    const regression = describeIntelligenceWriteRegression(previous, incoming, VERSIONED)

    expect(regression?.droppedProviderIds).toEqual(['beta'])
    expect(regression?.droppedLiveBindingKeys).toEqual(['text.chat/beta'])
    expect(regression?.providerCount).toEqual({ before: 2, after: 1 })
    expect(regression?.programOwnedLosses).toEqual([])
  })

  it.each<[string, ProbeProvider]>([
    ['its id', provider(ON_DEVICE_PROVIDER_ID)],
    ['its channel type', provider('local-dictation', { channelType: 'on-device' })],
    ['its ASR protocol', provider('local-dictation', { voiceAsr: { protocol: 'local-offline' } })]
  ])(
    'reports a dropped provider declared by %s as a program-owned loss',
    (_shape, onDeviceProvider) => {
      const previous = intelligenceDocument([onDeviceProvider, provider('alpha')], {})
      const incoming = intelligenceDocument([provider('alpha')], {})

      const regression = describeIntelligenceWriteRegression(previous, incoming, VERSIONED)

      expect(regression?.droppedProviderIds).toEqual([onDeviceProvider.id])
      expect(regression?.programOwnedLosses).toEqual([`provider ${onDeviceProvider.id}`])
    }
  )

  it('reports a dropped live on-device binding as a program-owned loss', () => {
    const previous = intelligenceDocument([provider('alpha')], {
      'audio.asr': [binding(ON_DEVICE_PROVIDER_ID, true)]
    })
    const incoming = intelligenceDocument([provider('alpha')], { 'audio.asr': [] })

    const regression = describeIntelligenceWriteRegression(previous, incoming, VERSIONED)

    expect(regression?.droppedLiveBindingKeys).toEqual(['audio.asr/tuff-local-asr'])
    expect(regression?.programOwnedLosses).toEqual(['binding audio.asr/tuff-local-asr'])
    expect(regression?.providerCount).toEqual({ before: 1, after: 1 })
  })

  it('reports a dropped idle on-device binding as a program-owned loss too', () => {
    const previous = intelligenceDocument([provider('alpha')], {
      'audio.asr': [binding(ON_DEVICE_PROVIDER_ID, false)]
    })
    const incoming = intelligenceDocument([provider('alpha')], { 'audio.asr': [] })

    const regression = describeIntelligenceWriteRegression(previous, incoming, VERSIONED)

    expect(regression?.droppedIdleBindingKeys).toEqual(['audio.asr/tuff-local-asr'])
    expect(regression?.droppedLiveBindingKeys).toEqual([])
    expect(regression?.programOwnedLosses).toEqual(['binding audio.asr/tuff-local-asr'])
  })

  it('reports an enabled binding switched off, and does not call it dropped', () => {
    const previous = intelligenceDocument([provider('alpha')], {
      'text.chat': [binding('alpha', true)]
    })
    const incoming = intelligenceDocument([provider('alpha')], {
      'text.chat': [binding('alpha', false)]
    })

    const regression = describeIntelligenceWriteRegression(previous, incoming, VERSIONED)

    expect(regression?.disabledBindingKeys).toEqual(['text.chat/alpha'])
    expect(regression?.droppedLiveBindingKeys).toEqual([])
    expect(regression?.droppedIdleBindingKeys).toEqual([])
    expect(regression?.bindingCount).toEqual({ before: 1, after: 1 })
  })

  it('treats a stored binding that never wrote "enabled" as on, so switching it off is reported', () => {
    const previous = intelligenceDocument([provider('alpha')], { 'text.chat': [binding('alpha')] })
    const incoming = intelligenceDocument([provider('alpha')], {
      'text.chat': [binding('alpha', false)]
    })

    const regression = describeIntelligenceWriteRegression(previous, incoming, VERSIONED)

    expect(regression?.disabledBindingKeys).toEqual(['text.chat/alpha'])
  })

  it('reports an on-device binding switched off as a program-owned loss', () => {
    const previous = intelligenceDocument([provider('alpha')], {
      'audio.asr': [binding(ON_DEVICE_PROVIDER_ID, true)]
    })
    const incoming = intelligenceDocument([provider('alpha')], {
      'audio.asr': [binding(ON_DEVICE_PROVIDER_ID, false)]
    })

    const regression = describeIntelligenceWriteRegression(previous, incoming, VERSIONED)

    expect(regression?.disabledBindingKeys).toEqual(['audio.asr/tuff-local-asr'])
    expect(regression?.programOwnedLosses).toEqual(['binding audio.asr/tuff-local-asr disabled'])
  })

  const stored = intelligenceDocument([provider('alpha')], {
    'text.chat': [binding('alpha', true)]
  })

  it.each([
    ['leaves providers and bindings untouched', stored],
    [
      'adds a provider and its binding',
      intelligenceDocument([provider('alpha'), provider('beta')], {
        'text.chat': [binding('alpha', true), binding('beta')]
      })
    ],
    [
      'adds a binding to a capability that had none',
      intelligenceDocument([provider('alpha')], {
        'text.chat': [binding('alpha', true)],
        'audio.asr': [binding('alpha')]
      })
    ]
  ])('returns null for a write that %s', (_label, incoming) => {
    expect(describeIntelligenceWriteRegression(stored, incoming, VERSIONED)).toBeNull()
  })

  it('does not report a binding the write re-enables', () => {
    const storedDisabled = intelligenceDocument([provider('alpha')], {
      'text.chat': [binding('alpha', false)]
    })
    const incoming = intelligenceDocument([provider('alpha')], {
      'text.chat': [binding('alpha', true)]
    })

    expect(describeIntelligenceWriteRegression(storedDisabled, incoming, VERSIONED)).toBeNull()
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['text that is not JSON', 'not json'],
    ['a JSON array', '[1,2]'],
    ['a number', 42]
  ])(
    'returns null rather than reporting every stored entry as dropped when the write document is %s',
    (_label, incoming) => {
      const previous = intelligenceDocument([provider('alpha'), provider('beta')], {
        'text.chat': [binding('alpha'), binding('beta')]
      })

      expect(describeIntelligenceWriteRegression(previous, incoming, VERSIONED)).toBeNull()
    }
  )

  it('reads provider and binding documents handed over as JSON strings', () => {
    const previous = intelligenceDocument([provider('alpha')], {
      'text.chat': [binding('alpha', true), binding('beta', true)]
    })
    const incoming = intelligenceDocument([provider('alpha')], {
      'text.chat': [binding('alpha', true)]
    })

    expect(
      describeIntelligenceWriteRegression(
        JSON.stringify(previous),
        JSON.stringify(incoming),
        VERSIONED
      )?.droppedLiveBindingKeys
    ).toEqual(['text.chat/beta'])
    expect(
      describeIntelligenceWriteRegression(previous, JSON.stringify(incoming), VERSIONED)
        ?.droppedLiveBindingKeys
    ).toEqual(['text.chat/beta'])
    expect(
      describeIntelligenceWriteRegression(JSON.stringify(previous), incoming, VERSIONED)
        ?.droppedLiveBindingKeys
    ).toEqual(['text.chat/beta'])
  })

  it('lists at most 8 dropped entries in each list while keeping the counts complete', () => {
    const liveIds = Array.from({ length: 10 }, (_entry, index) => `live-${index}`)
    const idleIds = Array.from({ length: 10 }, (_entry, index) => `idle-${index}`)
    const previous = intelligenceDocument(
      [...liveIds, ...idleIds].map((id) => provider(id)),
      {
        'text.chat': liveIds.map((id) => binding(id, true)),
        'audio.asr': idleIds.map((id) => binding(id, false))
      }
    )
    const incoming = intelligenceDocument([], {})

    const regression = describeIntelligenceWriteRegression(previous, incoming, VERSIONED)

    expect(regression?.droppedProviderIds).toEqual([...liveIds, ...idleIds].slice(0, 8))
    expect(regression?.droppedLiveBindingKeys).toEqual(
      liveIds.slice(0, 8).map((id) => `text.chat/${id}`)
    )
    expect(regression?.droppedIdleBindingKeys).toEqual(
      idleIds.slice(0, 8).map((id) => `audio.asr/${id}`)
    )
    expect(regression?.providerCount).toEqual({ before: 20, after: 0 })
    expect(regression?.bindingCount).toEqual({ before: 20, after: 0 })
  })

  it('does not report stored entries a report cannot name', () => {
    const previous = {
      version: 2,
      providers: [provider('alpha'), { id: '' }, { name: 'unnamed' }],
      capabilities: {
        'text.chat': { providers: [{ providerId: 'alpha' }, { enabled: true }, { providerId: 42 }] }
      }
    }
    const incoming = intelligenceDocument([provider('alpha')], { 'text.chat': [binding('alpha')] })

    expect(describeIntelligenceWriteRegression(previous, incoming, VERSIONED)).toBeNull()
  })

  it('reports an unconditional write that claims no base version even when it drops nothing', () => {
    const regression = describeIntelligenceWriteRegression(stored, stored, {
      clientVersion: undefined,
      serverVersion: 12
    })

    expect(regression?.unconditional).toBe(true)
    expect(regression?.clientVersion).toBeUndefined()
    expect(regression?.droppedProviderIds).toEqual([])
    expect(regression?.droppedLiveBindingKeys).toEqual([])
    expect(regression?.droppedIdleBindingKeys).toEqual([])
    expect(regression?.disabledBindingKeys).toEqual([])
  })

  it('returns null for a versioned write that drops nothing', () => {
    expect(describeIntelligenceWriteRegression(stored, stored, VERSIONED)).toBeNull()
  })
})

describe('reportIntelligenceWriteRegression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('warns with the flat field list when the write takes a program-owned route away', () => {
    reportIntelligenceWriteRegression(
      regressionFixture({
        clientVersion: undefined,
        unconditional: true,
        programOwnedLosses: ['binding audio.asr/tuff-local-asr']
      })
    )

    expect(probeLog.warn).toHaveBeenCalledTimes(1)
    expect(probeLog.info).not.toHaveBeenCalled()
    expect(probeLog.warn.mock.calls[0]?.[0]).toBe(
      'Renderer write removed a program-owned intelligence route client=vnone server=v12 unconditional=true providers=alpha live=text.chat/alpha programOwned=binding audio.asr/tuff-local-asr counts=3->1p/4->1b'
    )
  })

  it('records a plain regression at info, splitting live from idle and always reporting the counts', () => {
    reportIntelligenceWriteRegression(
      regressionFixture({
        clientVersion: 4,
        serverVersion: 4,
        droppedProviderIds: [],
        droppedLiveBindingKeys: ['text.chat/deepseek-default'],
        droppedIdleBindingKeys: [
          'text.chat/tuff-nexus-default',
          'text.chat/openai-default',
          'text.chat/anthropic-default'
        ],
        disabledBindingKeys: ['audio.asr/bailian'],
        programOwnedLosses: [],
        providerCount: { before: 2, after: 2 },
        bindingCount: { before: 75, after: 71 }
      })
    )

    expect(probeLog.info).toHaveBeenCalledTimes(1)
    expect(probeLog.warn).not.toHaveBeenCalled()
    expect(probeLog.info.mock.calls[0]?.[0]).toBe(
      'Renderer write regressed the intelligence config client=v4 server=v4 live=text.chat/deepseek-default idle=text.chat/tuff-nexus-default,text.chat/openai-default,text.chat/anthropic-default disabled=audio.asr/bailian counts=2->2p/75->71b'
    )
  })

  it('omits the fields whose list is empty and does not label a versioned write unconditional', () => {
    reportIntelligenceWriteRegression(
      regressionFixture({
        clientVersion: 9,
        serverVersion: 9,
        droppedProviderIds: [],
        droppedLiveBindingKeys: [],
        droppedIdleBindingKeys: [],
        disabledBindingKeys: ['text.chat/alpha'],
        programOwnedLosses: [],
        providerCount: { before: 1, after: 1 },
        bindingCount: { before: 1, after: 1 }
      })
    )

    expect(probeLog.info).toHaveBeenCalledTimes(1)
    expect(probeLog.warn).not.toHaveBeenCalled()
    expect(probeLog.info.mock.calls[0]?.[0]).toBe(
      'Renderer write regressed the intelligence config client=v9 server=v9 disabled=text.chat/alpha counts=1->1p/1->1b'
    )
  })

  it('warns when a write reaps an idle on-device binding', () => {
    const previous = intelligenceDocument([provider('alpha')], {
      'audio.asr': [binding(ON_DEVICE_PROVIDER_ID, false)]
    })
    const incoming = intelligenceDocument([provider('alpha')], { 'audio.asr': [] })

    const regression = describeIntelligenceWriteRegression(previous, incoming, VERSIONED)
    expect(regression).not.toBeNull()
    reportIntelligenceWriteRegression(regression!)

    expect(probeLog.warn).toHaveBeenCalledTimes(1)
    expect(probeLog.info).not.toHaveBeenCalled()
    expect(probeLog.warn.mock.calls[0]?.[0]).toBe(
      'Renderer write removed a program-owned intelligence route client=v7 server=v12 idle=audio.asr/tuff-local-asr programOwned=binding audio.asr/tuff-local-asr counts=1->1p/1->0b'
    )
  })
})
