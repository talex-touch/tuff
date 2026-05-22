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
        requireCheckedEvidence: true
      })
    ).toEqual({
      passed: false,
      failures: expect.arrayContaining([
        'Visible experience item is not passed: startup-packaged-hot',
        'Visible experience item has no artifact path: startup-packaged-hot',
        'Visible experience item has no screenshot or recording artifact: startup-first-screen',
        'Visible experience item has no screenshot or recording artifact: assistant-floating-ball-entry',
        'Visible experience item has no screenshot or recording artifact: assistant-screenshot-translate',
        'Visible experience item is missing required evidence check: startup-packaged-hot -> Current package version is used by the packaged artifact'
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

  it('passes when all required items have matching artifacts', () => {
    const manifest = buildCoreAppVisibleExperienceManifest({
      baselineVersion: '2.4.10-beta.25',
      generatedAt: '2026-05-17T00:00:00.000Z'
    })

    manifest.surfaces = manifest.surfaces.map((item) => ({
      ...item,
      status: 'passed',
      artifactPaths: [
        item.id.startsWith('startup-packaged')
          ? `docs/engineering/reports/${item.id}/summary.md`
          : `docs/engineering/reports/coreapp-visible/${item.id}.png`
      ],
      checkedEvidence:
        COREAPP_VISIBLE_EXPERIENCE_SURFACES.find((surface) => surface.id === item.id)
          ?.requiredEvidence ?? []
    }))

    expect(
      verifyCoreAppVisibleExperienceManifest(manifest, {
        requireAllPassed: true,
        requireArtifactPaths: true,
        requireVisualArtifacts: true,
        requireCheckedEvidence: true
      })
    ).toEqual({
      passed: true,
      failures: []
    })
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
    expect(template).toContain('- Collection steps:')
    expect(template).toContain(
      '- Run a query that returns no results and capture the retry/settings actions.'
    )
    expect(template).toContain(
      '- Click the floating ball and capture the Voice Panel opened next to the ball.'
    )
    expect(template).toContain(
      '- Repeat with an empty clipboard image state and capture the recovery hint.'
    )
    expect(template).toContain('- [ ] No-result state shows retry and File Index settings actions')
    expect(template).toContain(
      '- [ ] Clicking the floating ball opens the Voice Panel beside the ball'
    )
    expect(template).toContain('- Recommended artifacts:')
    expect(template).toContain('evidence/coreapp-visible/corebox-no-result.png')
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
