import { describe, expect, it } from 'vitest'
import {
  COREAPP_VISIBLE_EXPERIENCE_EVIDENCE_SCHEMA,
  COREAPP_VISIBLE_EXPERIENCE_SURFACES,
  buildCoreAppVisibleExperienceManifest,
  buildCoreAppVisibleExperienceCaptureReadiness,
  renderCoreAppVisibleExperienceEvidenceTemplate,
  verifyCoreAppVisibleExperienceManifest
} from './coreapp-visible-experience-evidence'

describe('CoreApp visible experience evidence', () => {
  it('builds a manifest covering every required visible surface', () => {
    const manifest = buildCoreAppVisibleExperienceManifest({
      baselineVersion: '2.4.10-beta.25',
      generatedAt: '2026-05-17T00:00:00.000Z'
    })

    expect(manifest.schema).toBe(COREAPP_VISIBLE_EXPERIENCE_EVIDENCE_SCHEMA)
    expect(manifest.baselineVersion).toBe('2.4.10-beta.25')
    expect(manifest.surfaces.map((item) => item.id)).toEqual(
      COREAPP_VISIBLE_EXPERIENCE_SURFACES.map((surface) => surface.id)
    )
    expect(manifest.surfaces.every((item) => Array.isArray(item.checkedEvidence))).toBe(true)
    expect(manifest.verification?.recommendedCommand).toContain(
      'visible:experience:verify -- --input "evidence/coreapp-visible/coreapp-visible-experience-manifest.json"'
    )
    expect(manifest.verification?.recommendedCommand).toContain('--requireCheckedEvidence')
    expect(manifest.verification?.recommendedCommand).toContain('--requireEvidenceTags')
  })

  it('fails the strict gate for pending items, missing artifacts, and unchecked evidence', () => {
    const manifest = buildCoreAppVisibleExperienceManifest({
      baselineVersion: '2.4.10-beta.25',
      generatedAt: '2026-05-17T00:00:00.000Z'
    })

    expect(
      verifyCoreAppVisibleExperienceManifest(manifest, {
        requireAllPassed: true,
        requireArtifactPaths: true,
        requireVisualArtifacts: true,
        requireCheckedEvidence: true,
        requireEvidenceTags: true
      })
    ).toEqual({
      passed: false,
      failures: expect.arrayContaining([
        'Visible experience item is not passed: startup-packaged-hot',
        'Visible experience item has no artifact path: startup-packaged-hot',
        'Visible experience item has no screenshot or recording artifact: startup-first-screen',
        'Visible experience item has no screenshot or recording artifact: assistant-floating-ball-entry',
        'Visible experience item has no screenshot or recording artifact: assistant-screenshot-translate',
        'Visible experience item is missing required evidence check: startup-packaged-hot -> Current package version is used by the packaged artifact',
        'Visible experience item is missing required evidence tag: corebox-ai-ask -> AI-STABLE-01'
      ])
    })
  })

  it('includes Assistant floating ball and clipboard image translation as visible evidence surfaces', () => {
    const assistantSurfaces = COREAPP_VISIBLE_EXPERIENCE_SURFACES.filter(
      (surface) => surface.group === 'assistant'
    )

    expect(assistantSurfaces.map((surface) => surface.id)).toEqual([
      'assistant-floating-ball-entry',
      'assistant-screenshot-translate'
    ])
    expect(assistantSurfaces.every((surface) => surface.required)).toBe(true)
    expect(assistantSurfaces.every((surface) => surface.requiresVisualArtifact)).toBe(true)
    expect(assistantSurfaces[0]?.requiredEvidence).toContain(
      'Dragged floating ball position persists after reopening the Assistant surface'
    )
    expect(assistantSurfaces[1]?.requiredEvidence).toContain(
      'Empty clipboard image and provider fallback remain visible and recoverable'
    )
  })

  it('requires CoreBox AI Ask text, OCR, permission, routing, and recoverable failure recent paths', () => {
    const coreboxAiAsk = COREAPP_VISIBLE_EXPERIENCE_SURFACES.find(
      (surface) => surface.id === 'corebox-ai-ask'
    )

    expect(coreboxAiAsk).toBeDefined()
    expect(coreboxAiAsk?.collectionSteps).toEqual(
      expect.arrayContaining([
        'Capture permission denied and Local/Ollama routing cases; local preferred routing must not reach a disabled Nexus provider.'
      ])
    )
    expect(coreboxAiAsk?.requiredEvidence).toEqual(
      expect.arrayContaining([
        'CoreBox AI Ask text.chat success preview is visible',
        'CoreBox AI Ask clipboard image vision.ocr to text.chat success preview is visible',
        'Provider, model, latency, trace id, and input kind metadata are visible for text and OCR paths',
        'Copy failure remains visible inside the preview',
        'Logged-out failure shows a sign-in recovery hint',
        'Provider unavailable failure shows a provider health or settings recovery hint',
        'Quota exhausted failure shows a credits or team quota recovery hint',
        'Model unsupported failure shows a supported model or capability recovery hint',
        'Permission denied failure does not call Intelligence SDK and shows a permission recovery hint',
        'Local/Ollama preferred routing does not call disabled Nexus provider and shows routing trace or provider metadata'
      ])
    )
    expect(coreboxAiAsk?.recommendedArtifacts).toEqual(
      expect.arrayContaining([
        'evidence/coreapp-visible/corebox-ai-text-success.png',
        'evidence/coreapp-visible/corebox-ai-ocr-success.png',
        'evidence/coreapp-visible/corebox-ai-copy-failure.png',
        'evidence/coreapp-visible/corebox-ai-failure-logged-out.png',
        'evidence/coreapp-visible/corebox-ai-failure-provider-unavailable.png',
        'evidence/coreapp-visible/corebox-ai-failure-quota-exhausted.png',
        'evidence/coreapp-visible/corebox-ai-failure-model-unsupported.png',
        'evidence/coreapp-visible/corebox-ai-failure-permission-denied.png',
        'evidence/coreapp-visible/corebox-ai-local-ollama-routing.png'
      ])
    )
    expect(coreboxAiAsk?.requiredEvidenceTags).toEqual([
      'AI-STABLE-01',
      'AI-STABLE-02',
      'AI-STABLE-03',
      'AI-STABLE-04',
      'AI-STABLE-05',
      'AI-STABLE-06',
      'AI-STABLE-07',
      'AI-STABLE-08'
    ])
    expect(coreboxAiAsk?.blockedWhen).toEqual(
      expect.arrayContaining([
        'Text success and OCR success are not captured as separate recent paths.',
        'Permission denied still invokes Intelligence SDK.',
        'Local/Ollama preferred routing calls a disabled Nexus provider.'
      ])
    )
  })

  it('passes when all required items have matching artifacts', () => {
    const manifest = buildCoreAppVisibleExperienceManifest({
      baselineVersion: '2.4.10-beta.25',
      generatedAt: '2026-05-17T00:00:00.000Z'
    })

    markAllVisibleExperienceItemsPassed(manifest)

    expect(
      verifyCoreAppVisibleExperienceManifest(manifest, {
        requireAllPassed: true,
        requireArtifactPaths: true,
        requireVisualArtifacts: true,
        requireCheckedEvidence: true,
        requireEvidenceTags: true
      })
    ).toEqual({
      passed: true,
      failures: []
    })
  })

  it('requires AI Stable evidence tags to reference attached artifacts', () => {
    const manifest = buildCoreAppVisibleExperienceManifest({
      baselineVersion: '2.4.10-beta.25',
      generatedAt: '2026-05-17T00:00:00.000Z'
    })
    markAllVisibleExperienceItemsPassed(manifest)

    const coreboxAiAsk = manifest.surfaces.find((item) => item.id === 'corebox-ai-ask')
    expect(coreboxAiAsk).toBeDefined()
    if (!coreboxAiAsk) return

    delete coreboxAiAsk.evidenceTagArtifacts?.['AI-STABLE-01']

    expect(
      verifyCoreAppVisibleExperienceManifest(manifest, {
        requireAllPassed: true,
        requireArtifactPaths: true,
        requireVisualArtifacts: true,
        requireCheckedEvidence: true,
        requireEvidenceTags: true
      }).failures
    ).toContain(
      'Visible experience item has no artifact for evidence tag: corebox-ai-ask -> AI-STABLE-01'
    )

    coreboxAiAsk.evidenceTagArtifacts = {
      ...coreboxAiAsk.evidenceTagArtifacts,
      'AI-STABLE-01': ['docs/engineering/reports/coreapp-visible/corebox-ai-ask.png.missing']
    }

    expect(
      verifyCoreAppVisibleExperienceManifest(manifest, {
        requireAllPassed: true,
        requireArtifactPaths: true,
        requireVisualArtifacts: true,
        requireCheckedEvidence: true,
        requireEvidenceTags: true
      }).failures
    ).toContain(
      'Visible experience item evidence tag references unknown artifact: corebox-ai-ask -> AI-STABLE-01 -> docs/engineering/reports/coreapp-visible/corebox-ai-ask.png.missing'
    )
  })

  it('requires AI Stable evidence tags to include visual artifacts', () => {
    const manifest = buildCoreAppVisibleExperienceManifest({
      baselineVersion: '2.4.10-beta.25',
      generatedAt: '2026-05-17T00:00:00.000Z'
    })
    markAllVisibleExperienceItemsPassed(manifest)

    const coreboxAiAsk = manifest.surfaces.find((item) => item.id === 'corebox-ai-ask')
    expect(coreboxAiAsk).toBeDefined()
    if (!coreboxAiAsk) return

    coreboxAiAsk.artifactPaths = [
      'docs/engineering/reports/coreapp-visible/corebox-ai-ask.png',
      'docs/engineering/reports/coreapp-visible/corebox-ai-ask-probe.json'
    ]
    coreboxAiAsk.evidenceTagArtifacts = {
      ...coreboxAiAsk.evidenceTagArtifacts,
      'AI-STABLE-01': ['docs/engineering/reports/coreapp-visible/corebox-ai-ask-probe.json']
    }

    expect(
      verifyCoreAppVisibleExperienceManifest(manifest, {
        requireAllPassed: true,
        requireArtifactPaths: true,
        requireVisualArtifacts: true,
        requireCheckedEvidence: true,
        requireEvidenceTags: true
      }).failures
    ).toContain(
      'Visible experience item evidence tag has no screenshot or recording artifact: corebox-ai-ask -> AI-STABLE-01'
    )
  })

  it('renders a checklist without claiming evidence is collected', () => {
    const manifest = buildCoreAppVisibleExperienceManifest({
      baselineVersion: '2.4.10-beta.25',
      generatedAt: '2026-05-17T00:00:00.000Z'
    })

    const template = renderCoreAppVisibleExperienceEvidenceTemplate(manifest)
    expect(template).toContain('# CoreApp Visible Experience Evidence')
    expect(template).toContain(
      '- Use real CoreApp UI on the target device; do not substitute mock screenshots.'
    )
    expect(template).toContain('### CoreBox search states')
    expect(template).toContain('### Assistant floating ball entry')
    expect(template).toContain('### Assistant clipboard image translation')
    expect(template).toContain('### CoreBox AI Ask preview')
    expect(template).toContain('- Collection steps:')
    expect(template).toContain(
      '- Run a query that returns no results and capture the retry/settings actions.'
    )
    expect(template).toContain(
      '- Ask with a clipboard image and capture the vision.ocr to text.chat answer preview.'
    )
    expect(template).toContain(
      '- Click the floating ball and capture the Voice Panel opened next to the ball.'
    )
    expect(template).toContain(
      '- Repeat with an empty clipboard image state and capture the recovery hint.'
    )
    expect(template).toContain('- [ ] CoreBox AI Ask text.chat success preview is visible')
    expect(template).toContain(
      '- [ ] Provider unavailable failure shows a provider health or settings recovery hint'
    )
    expect(template).toContain(
      '- [ ] Permission denied failure does not call Intelligence SDK and shows a permission recovery hint'
    )
    expect(template).toContain(
      '- [ ] Local/Ollama preferred routing does not call disabled Nexus provider and shows routing trace or provider metadata'
    )
    expect(template).toContain('- Required evidence tags:')
    expect(template).toContain('- [ ] AI-STABLE-01')
    expect(template).toContain('- [ ] AI-STABLE-08')
    expect(template).toContain('- [ ] No-result state shows retry and File Index settings actions')
    expect(template).toContain(
      '- [ ] Clicking the floating ball opens the Voice Panel beside the ball'
    )
    expect(template).toContain('- Recommended artifacts:')
    expect(template).toContain('- Artifact paths:\n  - _none_')
    expect(template).not.toContain('  - \n')
    expect(template).toContain('evidence/coreapp-visible/corebox-no-result.png')
    expect(template).toContain('evidence/coreapp-visible/corebox-ai-ocr-success.png')
    expect(template).toContain('evidence/coreapp-visible/corebox-ai-failure-model-unsupported.png')
    expect(template).toContain('evidence/coreapp-visible/corebox-ai-failure-permission-denied.png')
    expect(template).toContain('evidence/coreapp-visible/corebox-ai-local-ollama-routing.png')
    expect(template).toContain(
      'evidence/coreapp-visible/assistant-clipboard-image-translate-result.png'
    )
    expect(template).toContain('- Block instead of pass when:')
    expect(template).toContain('Reason/status text overlaps row content or is clipped.')
    expect(template).toContain(
      'The Assistant path captures the screen instead of consuming the current clipboard image.'
    )
  })

  it('renders checked evidence when the manifest records a completed checklist item', () => {
    const manifest = buildCoreAppVisibleExperienceManifest({
      baselineVersion: '2.4.10-beta.25',
      generatedAt: '2026-05-17T00:00:00.000Z'
    })

    const coreboxSearchState = manifest.surfaces.find((item) => item.id === 'corebox-search-states')
    if (coreboxSearchState) {
      coreboxSearchState.checkedEvidence = [
        'No-result state shows retry and File Index settings actions'
      ]
    }

    expect(renderCoreAppVisibleExperienceEvidenceTemplate(manifest)).toContain(
      '- [x] No-result state shows retry and File Index settings actions'
    )
  })

  it('renders checked evidence tags when the manifest records AI Stable item ids', () => {
    const manifest = buildCoreAppVisibleExperienceManifest({
      baselineVersion: '2.4.10-beta.25',
      generatedAt: '2026-05-17T00:00:00.000Z'
    })

    const coreboxAiAsk = manifest.surfaces.find((item) => item.id === 'corebox-ai-ask')
    if (coreboxAiAsk) {
      coreboxAiAsk.evidenceTags = ['AI-STABLE-06', 'ai-stable-07']
      coreboxAiAsk.artifactPaths = [
        'docs/engineering/reports/coreapp-visible/model-unsupported.png',
        'docs/engineering/reports/coreapp-visible/permission-denied.png'
      ]
      coreboxAiAsk.evidenceTagArtifacts = {
        'AI-STABLE-06': ['docs/engineering/reports/coreapp-visible/model-unsupported.png'],
        'AI-STABLE-07': ['docs/engineering/reports/coreapp-visible/permission-denied.png']
      }
    }

    const template = renderCoreAppVisibleExperienceEvidenceTemplate(manifest)
    expect(template).toContain('- [x] AI-STABLE-06')
    expect(template).toContain(
      '    - docs/engineering/reports/coreapp-visible/model-unsupported.png'
    )
    expect(template).toContain('- [x] AI-STABLE-07')
    expect(template).toContain('- [ ] AI-STABLE-08')
  })

  it('blocks capture readiness when packaged artifact and capture paths are not usable', () => {
    const report = buildCoreAppVisibleExperienceCaptureReadiness({
      expectedVersion: '2.4.10-beta.25',
      packagedArtifact: {
        exists: true,
        version: '2.4.10-beta.23',
        path: 'apps/core-app/dist/mac-arm64/tuff.app'
      },
      browserSmoke: {
        archived: true,
        hasIpcRendererMissingError: true,
        path: 'docs/engineering/reports/coreapp-visible-browser-smoke-2026-05-17/README.md'
      },
      electronDevCapture: {
        attempted: true,
        remoteDebuggingAvailable: false,
        path: 'docs/engineering/reports/coreapp-visible-electron-dev-capture-2026-05-17/README.md'
      },
      screenRecording: {
        checked: true,
        granted: false
      }
    })

    expect(report.ready).toBe(false)
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'packaged-artifact',
          status: 'blocked',
          message: expect.stringContaining('expected 2.4.10-beta.25, got 2.4.10-beta.23')
        }),
        expect.objectContaining({
          id: 'browser-smoke-boundary',
          status: 'warning',
          message: expect.stringContaining('negative evidence')
        }),
        expect.objectContaining({
          id: 'electron-dev-capture',
          status: 'blocked'
        }),
        expect.objectContaining({
          id: 'screen-recording',
          status: 'blocked'
        })
      ])
    )
  })

  it('marks capture readiness ready when every blocking capture input is available', () => {
    const report = buildCoreAppVisibleExperienceCaptureReadiness({
      expectedVersion: '2.4.10-beta.25',
      packagedArtifact: {
        exists: true,
        version: '2.4.10-beta.25',
        path: 'apps/core-app/dist/mac-arm64/tuff.app'
      },
      browserSmoke: {
        archived: true,
        hasIpcRendererMissingError: true
      },
      electronDevCapture: {
        attempted: true,
        remoteDebuggingAvailable: true
      },
      screenRecording: {
        checked: true,
        granted: true
      }
    })

    expect(report.ready).toBe(true)
    expect(report.checks.every((check) => check.status !== 'blocked')).toBe(true)
  })
})

function markAllVisibleExperienceItemsPassed(
  manifest: ReturnType<typeof buildCoreAppVisibleExperienceManifest>
): void {
  manifest.surfaces = manifest.surfaces.map((item) => {
    const surface = COREAPP_VISIBLE_EXPERIENCE_SURFACES.find((surface) => surface.id === item.id)
    const artifactPath = item.id.startsWith('startup-packaged')
      ? `docs/engineering/reports/${item.id}/summary.md`
      : `docs/engineering/reports/coreapp-visible/${item.id}.png`

    return {
      ...item,
      status: 'passed',
      artifactPaths: [artifactPath],
      checkedEvidence: surface?.requiredEvidence ?? [],
      evidenceTags: surface?.requiredEvidenceTags ?? [],
      evidenceTagArtifacts: Object.fromEntries(
        (surface?.requiredEvidenceTags ?? []).map((tag) => [tag, [artifactPath]])
      )
    }
  })
}
