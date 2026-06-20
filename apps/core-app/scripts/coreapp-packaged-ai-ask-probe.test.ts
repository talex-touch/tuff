import { describe, expect, it } from 'vitest'
import { buildEvidenceChecks, type CoreBoxProbeDom } from './coreapp-packaged-ai-ask-probe'

function makeProbeDom(bodyText: string): CoreBoxProbeDom {
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
    buttons: []
  }
}

describe('coreapp packaged AI Ask probe evidence checks', () => {
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
          'Local Ollama routing provider metadata'
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
      expect.arrayContaining(['Local', 'Ollama', 'routing'])
    )
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
      missingSignals: expect.arrayContaining(['text.chat', 'provider', 'latency', 'trace'])
    })

    const [strongCheck] = buildEvidenceChecks(
      makeProbeDom('text.chat response provider Nexus model gpt-4.1 latency 120 ms trace abc'),
      ['AI-STABLE-01'],
      ['screen.png']
    )

    expect(strongCheck).toMatchObject({
      tag: 'AI-STABLE-01',
      matched: true,
      signalMatched: true,
      hasVisualArtifact: true
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
      missingSignals: expect.arrayContaining(['provider', 'model', 'latency', 'trace'])
    })

    const [strongCheck] = buildEvidenceChecks(
      makeProbeDom(
        'vision.ocr image text.chat answer provider Local model qwen latency 90 ms trace xyz'
      ),
      ['AI-STABLE-02'],
      ['ocr.png']
    )

    expect(strongCheck).toMatchObject({
      tag: 'AI-STABLE-02',
      matched: true,
      signalMatched: true,
      hasVisualArtifact: true
    })
  })

  it('does not treat a bare local provider label as Local/Ollama routing evidence', () => {
    const [weakCheck] = buildEvidenceChecks(
      makeProbeDom('Local provider is visible'),
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
      hasVisualArtifact: false,
      artifactPaths: ['probe.json', 'trace.log'],
      visualArtifactPaths: []
    })
  })
})
