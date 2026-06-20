import { describe, expect, it } from 'vitest'
import {
  buildEvidenceChecks,
  dispatchCoreBoxSubmitKey,
  prepareCoreBoxPromptSendMode,
  selectCoreBoxTarget,
  type CdpSend,
  type CoreBoxProbeDom,
  type DevToolsTarget
} from './coreapp-packaged-ai-ask-probe'

function makeProbeDom(bodyText: string, overrides: Partial<CoreBoxProbeDom> = {}): CoreBoxProbeDom {
  return {
    href: 'app://corebox',
    title: 'Tuff CoreBox',
    readyState: 'complete',
    bodyText,
    bodyClass: 'core-box',
    hasCoreBoxClass: true,
    inputIdExists: true,
    inputValue: '',
    hasAiChatbot: true,
    hasErrorNotice: false,
    hasPermissionText: false,
    hasModelUnsupportedText: false,
    hasProviderUnavailableText: false,
    hasLoggedOutText: false,
    hasQuotaText: false,
    buttons: [],
    ...overrides
  }
}

describe('coreapp packaged AI Ask probe evidence checks', () => {
  it('submits CoreBox input through CDP key events', async () => {
    const calls: Array<{ method: string; params?: Record<string, unknown> }> = []
    const send: CdpSend = async (method, params) => {
      calls.push({ method, params })
      return {}
    }

    await dispatchCoreBoxSubmitKey(send)

    expect(calls).toEqual([
      {
        method: 'Input.dispatchKeyEvent',
        params: {
          type: 'keyDown',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13
        }
      },
      {
        method: 'Input.dispatchKeyEvent',
        params: {
          type: 'keyUp',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13
        }
      }
    ])
  })

  it('does not click a feature entry when CoreBox is already in prompt send mode', async () => {
    const calls: string[] = []
    const send: CdpSend = async (_method, params) => {
      calls.push(String(params?.expression || ''))
      return {
        result: {
          result: {
            value: calls.length === 1
          }
        }
      }
    }

    await expect(prepareCoreBoxPromptSendMode(send)).resolves.toEqual({
      alreadyInSendMode: true,
      clickedFeatureEntry: false,
      readyForPrompt: true,
      activationText: ''
    })
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('.CoreBox-SendButton')
  })

  it('uses CDP Enter first to execute the selected AI Ask entry', async () => {
    let sendModeChecks = 0
    const calls: Array<{ method: string; params?: Record<string, unknown> }> = []
    const send: CdpSend = async (method, params) => {
      calls.push({ method, params })
      const expression = String(params?.expression || '')
      if (expression.includes('.CoreBox-SendButton')) {
        sendModeChecks += 1
        return {
          result: {
            result: {
              value: sendModeChecks > 1
            }
          }
        }
      }
      if (expression.includes('widget-mode')) {
        return {
          result: {
            result: {
              value: ''
            }
          }
        }
      }
      return {}
    }

    await expect(prepareCoreBoxPromptSendMode(send)).resolves.toEqual({
      alreadyInSendMode: false,
      clickedFeatureEntry: true,
      readyForPrompt: true,
      clickMethod: 'cdp-enter',
      activationText: ''
    })
    expect(calls.map((call) => call.method)).toEqual([
      'Runtime.evaluate',
      'Input.dispatchKeyEvent',
      'Input.dispatchKeyEvent',
      'Runtime.evaluate',
      'Runtime.evaluate'
    ])
  })

  it('falls back to CDP mouse events when Enter does not activate the AI Ask entry', async () => {
    let sendModeChecks = 0
    const calls: Array<{ method: string; params?: Record<string, unknown> }> = []
    const send: CdpSend = async (method, params) => {
      calls.push({ method, params })
      const expression = String(params?.expression || '')
      if (expression.includes('.CoreBox-SendButton')) {
        sendModeChecks += 1
        return {
          result: {
            result: {
              value: sendModeChecks > 3
            }
          }
        }
      }
      if (expression.includes('widget-mode')) {
        return {
          result: {
            result: {
              value: ''
            }
          }
        }
      }
      if (expression.includes('getBoundingClientRect')) {
        return {
          result: {
            result: {
              value: { x: 24, y: 48 }
            }
          }
        }
      }
      return {
        result: {
          result: {
            value: true
          }
        }
      }
    }

    await expect(prepareCoreBoxPromptSendMode(send, { keyboardTimeoutMs: 0 })).resolves.toEqual({
      alreadyInSendMode: false,
      clickedFeatureEntry: true,
      readyForPrompt: true,
      clickMethod: 'cdp-mouse',
      activationText: ''
    })
    expect(calls.map((call) => call.method)).toEqual([
      'Runtime.evaluate',
      'Input.dispatchKeyEvent',
      'Input.dispatchKeyEvent',
      'Runtime.evaluate',
      'Runtime.evaluate',
      'Runtime.evaluate',
      'Input.dispatchMouseEvent',
      'Input.dispatchMouseEvent',
      'Runtime.evaluate',
      'Runtime.evaluate'
    ])
    expect(calls[5]?.params?.expression).toContain('getBoundingClientRect')
    expect(calls[6]?.params).toMatchObject({
      type: 'mousePressed',
      x: 24,
      y: 48,
      button: 'left',
      clickCount: 1
    })
    expect(calls[7]?.params).toMatchObject({
      type: 'mouseReleased',
      x: 24,
      y: 48,
      button: 'left',
      clickCount: 1
    })
  })

  it('prefers the primary CoreBox target over detached DivisionBox targets', () => {
    const detached = {
      target: { id: 'detached', title: 'Tuff', type: 'page', url: 'app://detached' },
      dom: makeProbeDom('touch-intelligence detached', { bodyClass: 'MacIntel core-box division-box' })
    }
    const primary = {
      target: { id: 'primary', title: 'Tuff', type: 'page', url: 'app://primary' },
      dom: makeProbeDom('touch-intelligence primary', { bodyClass: 'MacIntel core-box' })
    }

    const selected = selectCoreBoxTarget([
      detached,
      primary
    ] as Array<{ target: DevToolsTarget; dom: CoreBoxProbeDom }>)

    expect(selected?.target.id).toBe('primary')
  })

  it('deduplicates requested AI Stable tags and binds artifact paths', () => {
    const checks = buildEvidenceChecks(
      makeProbeDom('需要登录 login sign in 请登录后重试 recover'),
      ['AI-STABLE-03', 'AI-STABLE-03'],
      ['probe.json', 'screen.png']
    )

    expect(checks).toHaveLength(1)
    expect(checks[0]).toMatchObject({
      tag: 'AI-STABLE-03',
      matched: true,
      signalMatched: true,
      hasVisualArtifact: true,
      artifactPaths: ['probe.json', 'screen.png']
    })
  })

  it('requires failure evidence to include the error class and recovery hint', () => {
    const weakChecks = buildEvidenceChecks(
      makeProbeDom(['NEXUS_STREAM_UNSUPPORTED', 'permission denied', 'quota exhausted'].join('\n')),
      ['AI-STABLE-05', 'AI-STABLE-06', 'AI-STABLE-07'],
      ['recording.webm']
    )

    expect(weakChecks.map((check) => [check.tag, check.matched])).toEqual([
      ['AI-STABLE-05', false],
      ['AI-STABLE-06', false],
      ['AI-STABLE-07', false]
    ])

    const checks = buildEvidenceChecks(
      makeProbeDom(
        [
          'NEXUS_STREAM_UNSUPPORTED model capability supported model retry',
          '权限已拒绝，请在插件权限设置中授予 intelligence.basic 后重试',
          'quota exhausted credits top up retry',
          'Routing provider metadata Provider local-default Model qwen2.5:3b Latency 2354 ms Trace trace-abc Input kind text Capability text.chat'
        ].join('\n')
      ),
      ['AI-STABLE-05', 'AI-STABLE-06', 'AI-STABLE-07', 'AI-STABLE-08'],
      ['recording.webm']
    )

    expect(checks.map((check) => [check.tag, check.matched])).toEqual([
      ['AI-STABLE-05', true],
      ['AI-STABLE-06', true],
      ['AI-STABLE-07', true],
      ['AI-STABLE-08', true]
    ])
    expect(checks[0]?.matchedSignals).toEqual(
      expect.arrayContaining(['quota exhausted', 'credits', 'top up', 'retry'])
    )
    expect(checks[1]?.matchedSignals).toEqual(
      expect.arrayContaining([
        'NEXUS_STREAM_UNSUPPORTED',
        'capability',
        'model',
        'supported model',
        'retry'
      ])
    )
    expect(checks[2]?.matchedSignals).toContain('intelligence.basic')
    expect(checks[3]?.matchedSignals).toEqual(
      expect.arrayContaining([
        'local-default',
        'routing',
        'Provider',
        'Model',
        'Latency',
        'Trace',
        'Input kind',
        'Capability',
        'text.chat'
      ])
    )
  })

  it('rejects AI Stable checks when signals only come from the current input echo', () => {
    const inputValue = 'ai reply with exactly local-ok for AI-STABLE-08 Local Ollama routing'
    const [check] = buildEvidenceChecks(
      makeProbeDom(
        [
          inputValue,
          '智能问答',
          '使用 ai/@ai 前缀在 CoreBox 里调用 AI 回答，支持图片 OCR'
        ].join('\n'),
        { inputValue }
      ),
      ['AI-STABLE-08'],
      ['screen.png']
    )

    expect(check).toMatchObject({
      tag: 'AI-STABLE-08',
      matched: false,
      signalMatched: false,
      hasVisualArtifact: true,
      matchedSignals: []
    })
  })

  it('blocks AI Stable evidence when the widget failed to load', () => {
    const [check] = buildEvidenceChecks(
      makeProbeDom(
        'Widget 加载失败\nRouting provider metadata Provider local-default Model qwen2.5:3b Latency 20 ms Trace trace-abc Input kind text Capability text.chat'
      ),
      ['AI-STABLE-08'],
      ['screen.png']
    )

    expect(check).toMatchObject({
      tag: 'AI-STABLE-08',
      signalMatched: true,
      matched: false,
      blockedByFailureSignal: true,
      matchedBlockedSignals: expect.arrayContaining(['Widget 加载失败'])
    })
  })

  it('requires logged-out and provider-unavailable evidence to include recovery guidance', () => {
    const weakChecks = buildEvidenceChecks(
      makeProbeDom('logged out provider unavailable'),
      ['AI-STABLE-03', 'AI-STABLE-04'],
      ['screen.png']
    )

    expect(weakChecks.map((check) => [check.tag, check.matched])).toEqual([
      ['AI-STABLE-03', false],
      ['AI-STABLE-04', false]
    ])

    const checks = buildEvidenceChecks(
      makeProbeDom(
        ['logged out sign in retry', 'provider unavailable provider health settings recover'].join(
          '\n'
        )
      ),
      ['AI-STABLE-03', 'AI-STABLE-04'],
      ['screen.png']
    )

    expect(checks.map((check) => [check.tag, check.matched])).toEqual([
      ['AI-STABLE-03', true],
      ['AI-STABLE-04', true]
    ])
  })

  it('rejects failure evidence when provider or SDK invocation success is visible', () => {
    const checks = buildEvidenceChecks(
      makeProbeDom(
        [
          'logged out sign in retry provider called',
          'provider unavailable provider health settings recover fallback success',
          'quota exhausted credits top up retry provider returned answer',
          'NEXUS_STREAM_UNSUPPORTED model capability supported model retry text.chat response',
          'permission denied intelligence.basic settings retry Intelligence SDK called'
        ].join('\n')
      ),
      ['AI-STABLE-03', 'AI-STABLE-04', 'AI-STABLE-05', 'AI-STABLE-06', 'AI-STABLE-07'],
      ['failure.png']
    )

    expect(checks.map((check) => [check.tag, check.signalMatched, check.matched])).toEqual([
      ['AI-STABLE-03', true, false],
      ['AI-STABLE-04', true, false],
      ['AI-STABLE-05', true, false],
      ['AI-STABLE-06', true, false],
      ['AI-STABLE-07', true, false]
    ])
    expect(checks.map((check) => check.blockedByFailureSignal)).toEqual([
      true,
      true,
      true,
      true,
      true
    ])
    expect(checks[0]?.matchedBlockedSignals).toContain('provider called')
    expect(checks[1]?.matchedBlockedSignals).toContain('fallback success')
    expect(checks[2]?.matchedBlockedSignals).toContain('provider returned answer')
    expect(checks[3]?.matchedBlockedSignals).toContain('text.chat response')
    expect(checks[4]?.matchedBlockedSignals).toContain('Intelligence SDK called')
  })

  it('requires text success evidence to include answer, route metadata, latency, and trace signals', () => {
    const [weakCheck] = buildEvidenceChecks(
      makeProbeDom('response from model'),
      ['AI-STABLE-01'],
      ['screen.png']
    )

    expect(weakCheck).toMatchObject({
      tag: 'AI-STABLE-01',
      matched: false,
      signalMatched: false,
      hasVisualArtifact: true,
      matchedSignals: expect.arrayContaining(['response', 'model']),
      missingSignals: expect.arrayContaining([
        'text.chat',
        'provider',
        'latency',
        'input kind',
        'trace'
      ])
    })

    const [strongCheck] = buildEvidenceChecks(
      makeProbeDom(
        'text.chat response provider Nexus model gpt-4.1 latency 120 ms input kind text trace abc'
      ),
      ['AI-STABLE-01'],
      ['screen.png']
    )

    expect(strongCheck).toMatchObject({
      tag: 'AI-STABLE-01',
      matched: true,
      signalMatched: true,
      blockedByFailureSignal: false,
      hasVisualArtifact: true
    })
  })

  it('rejects text success evidence without input kind metadata', () => {
    const [check] = buildEvidenceChecks(
      makeProbeDom('text.chat response provider Nexus model gpt-4.1 latency 120 ms trace abc'),
      ['AI-STABLE-01'],
      ['screen.png']
    )

    expect(check).toMatchObject({
      tag: 'AI-STABLE-01',
      matched: false,
      signalMatched: false,
      hasVisualArtifact: true,
      missingSignals: expect.arrayContaining(['input kind', 'inputKind', 'input', '输入'])
    })
  })

  it('rejects text success evidence when failure-state text is visible', () => {
    const [check] = buildEvidenceChecks(
      makeProbeDom(
        'text.chat response provider Nexus model gpt-4.1 latency 120 ms input kind text trace abc Error 请求失败 NEXUS_STREAM_UNSUPPORTED empty response'
      ),
      ['AI-STABLE-01'],
      ['screen.png']
    )

    expect(check).toMatchObject({
      tag: 'AI-STABLE-01',
      matched: false,
      signalMatched: true,
      blockedByFailureSignal: true,
      hasVisualArtifact: true,
      matchedBlockedSignals: expect.arrayContaining([
        'Error',
        '请求失败',
        'NEXUS_STREAM_UNSUPPORTED',
        'empty response'
      ])
    })
  })

  it('requires OCR success evidence to include image handoff plus text route metadata', () => {
    const [weakCheck] = buildEvidenceChecks(
      makeProbeDom('OCR image text.chat answer'),
      ['AI-STABLE-02'],
      ['ocr.png']
    )

    expect(weakCheck).toMatchObject({
      tag: 'AI-STABLE-02',
      matched: false,
      signalMatched: false,
      missingSignals: expect.arrayContaining([
        'provider',
        'model',
        'latency',
        'input kind',
        'trace'
      ])
    })

    const [strongCheck] = buildEvidenceChecks(
      makeProbeDom(
        'vision.ocr image text.chat answer provider Local model qwen latency 90 ms input kind image trace xyz'
      ),
      ['AI-STABLE-02'],
      ['ocr.png']
    )

    expect(strongCheck).toMatchObject({
      tag: 'AI-STABLE-02',
      matched: true,
      signalMatched: true,
      blockedByFailureSignal: false,
      hasVisualArtifact: true
    })
  })

  it('rejects OCR success evidence without input kind metadata', () => {
    const [check] = buildEvidenceChecks(
      makeProbeDom(
        'vision.ocr image text.chat answer provider Local model qwen latency 90 ms trace xyz'
      ),
      ['AI-STABLE-02'],
      ['ocr.png']
    )

    expect(check).toMatchObject({
      tag: 'AI-STABLE-02',
      matched: false,
      signalMatched: false,
      hasVisualArtifact: true,
      missingSignals: expect.arrayContaining(['input kind', 'inputKind', 'input', '输入'])
    })
  })

  it('rejects OCR success evidence when failure-state text is visible', () => {
    const [check] = buildEvidenceChecks(
      makeProbeDom(
        'vision.ocr image text.chat answer provider Local model qwen latency 90 ms input kind image trace xyz permission denied no answer'
      ),
      ['AI-STABLE-02'],
      ['ocr.png']
    )

    expect(check).toMatchObject({
      tag: 'AI-STABLE-02',
      matched: false,
      signalMatched: true,
      blockedByFailureSignal: true,
      hasVisualArtifact: true,
      matchedBlockedSignals: expect.arrayContaining(['permission denied', 'no answer'])
    })
  })

  it('does not treat a bare local provider label as Local/Ollama routing evidence', () => {
    const [weakCheck] = buildEvidenceChecks(
      makeProbeDom('local-default provider is visible'),
      ['AI-STABLE-08'],
      ['routing.png']
    )

    expect(weakCheck).toMatchObject({
      tag: 'AI-STABLE-08',
      matched: false,
      signalMatched: false,
      missingSignals: expect.arrayContaining(['routing', 'route', 'provider metadata', '路由'])
    })
  })

  it('requires Local/Ollama routing evidence to include provider, model, latency, trace, input kind, and capability metadata', () => {
    const [weakCheck] = buildEvidenceChecks(
      makeProbeDom('Local/Ollama routing provider metadata'),
      ['AI-STABLE-08'],
      ['routing.png']
    )

    expect(weakCheck).toMatchObject({
      tag: 'AI-STABLE-08',
      matched: false,
      signalMatched: false,
      missingSignals: expect.arrayContaining([
        'Model',
        'Latency',
        'Trace',
        'Input kind',
        'Capability'
      ])
    })

    const [strongCheck] = buildEvidenceChecks(
      makeProbeDom(
        'Routing provider metadata Provider local-default Model qwen2.5:3b Latency 2354 ms Trace trace-abc Input kind text Capability text.chat'
      ),
      ['AI-STABLE-08'],
      ['routing.png']
    )

    expect(strongCheck).toMatchObject({
      tag: 'AI-STABLE-08',
      matched: true,
      signalMatched: true,
      blockedByFailureSignal: false,
      hasVisualArtifact: true
    })
  })

  it('rejects Local/Ollama routing evidence when disabled Nexus provider calls are visible', () => {
    const [check] = buildEvidenceChecks(
      makeProbeDom(
        'Routing provider metadata Provider local-default Model qwen2.5:3b Latency 2354 ms Trace trace-abc Input kind text Capability text.chat fallback to Nexus provider called provider=Nexus Nexus response'
      ),
      ['AI-STABLE-08'],
      ['routing.png']
    )

    expect(check).toMatchObject({
      tag: 'AI-STABLE-08',
      matched: false,
      signalMatched: true,
      blockedByFailureSignal: true,
      hasVisualArtifact: true,
      matchedBlockedSignals: expect.arrayContaining([
        'fallback to Nexus',
        'provider=Nexus',
        'Nexus response'
      ])
    })
  })

  it('reports missing signals for unmatched evidence tags', () => {
    const [check] = buildEvidenceChecks(
      makeProbeDom('CoreBox ready'),
      ['AI-STABLE-05'],
      ['screen.png']
    )

    expect(check).toMatchObject({
      tag: 'AI-STABLE-05',
      matched: false,
      signalMatched: false,
      hasVisualArtifact: true,
      matchedSignals: [],
      missingSignals: expect.arrayContaining(['quota', 'credits', '积分', '配额', '恢复', 'retry'])
    })
  })

  it('does not match an expected AI Stable tag without screenshot or recording artifacts', () => {
    const [check] = buildEvidenceChecks(
      makeProbeDom('配额不足 quota exhausted credits 充值 retry'),
      ['AI-STABLE-05'],
      ['probe.json', 'trace.log']
    )

    expect(check).toMatchObject({
      tag: 'AI-STABLE-05',
      matched: false,
      signalMatched: true,
      blockedByFailureSignal: false,
      hasVisualArtifact: false,
      artifactPaths: ['probe.json', 'trace.log'],
      visualArtifactPaths: []
    })
  })
})
