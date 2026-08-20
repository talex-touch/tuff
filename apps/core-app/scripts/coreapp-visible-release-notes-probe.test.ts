import { describe, expect, it } from 'vitest'
import {
  buildReleaseNotesEvidenceChecks,
  navigateToUpdatePageExpression,
  readReleaseNotesDomExpression,
  screenshotFileName,
  selectMainWindowTarget,
  UPDATE_ROUTE_HASH,
  VIEWPORTS,
  type DevToolsTarget,
  type ReleaseNotesProbeDom
} from './coreapp-visible-release-notes-probe'

/**
 * Covers the decision half of the probe, per the split in `coreapp-packaged-ai-ask-probe.test.ts`.
 * The launch/attach/capture wiring is exercised only by a real run and is not asserted here — a
 * test that mocked CDP into passing would say nothing about whether the app renders the dialog.
 */

function dom(overrides: Partial<ReleaseNotesProbeDom> = {}): ReleaseNotesProbeDom {
  return {
    href: 'app://index.html#/',
    readyState: 'complete',
    hasDialog: true,
    dialogVersionCount: 2,
    dialogSummaryCount: 7,
    hasDialogActions: true,
    hash: UPDATE_ROUTE_HASH,
    hasSettingsPage: true,
    bodyText: '',
    ...overrides
  }
}

const failing = (checks: ReturnType<typeof buildReleaseNotesEvidenceChecks>): string[] =>
  checks.filter((check) => !check.ok).map((check) => check.tag)

describe('buildReleaseNotesEvidenceChecks', () => {
  it('passes a fresh-profile capture', () => {
    expect(failing(buildReleaseNotesEvidenceChecks(dom()))).toEqual([])
  })

  /**
   * The case this probe exists for. Against a used profile the version is already acknowledged, so
   * the dialog never opens — and the run must say so loudly rather than produce no dialog evidence,
   * which would read the same as a pass in any summary.
   */
  it('reports a missing dialog as a failed check, not as silence', () => {
    const checks = buildReleaseNotesEvidenceChecks(dom({ hasDialog: false }))
    expect(failing(checks)).toContain('dialog-not-shown')
    expect(checks.find((check) => check.tag === 'dialog-not-shown')?.detail).toMatch(/userDataDir/)
  })

  it('fails when the dialog rendered no version entries', () => {
    expect(failing(buildReleaseNotesEvidenceChecks(dom({ dialogVersionCount: 0 })))).toContain(
      'dialog-has-entries'
    )
  })

  it('fails when the dialog rendered versions but no summary bullets', () => {
    expect(failing(buildReleaseNotesEvidenceChecks(dom({ dialogSummaryCount: 0 })))).toContain(
      'dialog-has-entries'
    )
  })

  it('fails when the dialog has no dismiss affordance', () => {
    expect(failing(buildReleaseNotesEvidenceChecks(dom({ hasDialogActions: false })))).toContain(
      'dialog-dismissible'
    )
  })

  /** Route resolved but nothing rendered is a different bug from never having routed. */
  it('separates a wrong route from a route that rendered nothing', () => {
    const wrongRoute = buildReleaseNotesEvidenceChecks(dom({ hash: '#/setting/overview' }))
    expect(failing(wrongRoute)).toContain('update-page-reached')
    expect(wrongRoute.find((c) => c.tag === 'update-page-reached')?.detail).toMatch(/expected/)

    const blankPage = buildReleaseNotesEvidenceChecks(dom({ hasSettingsPage: false }))
    expect(failing(blankPage)).toContain('update-page-reached')
    expect(blankPage.find((c) => c.tag === 'update-page-reached')?.detail).toMatch(/did not render/)
  })

  /** A half-loaded renderer must not be judged at all — every other check would be noise. */
  it('reports only readiness when the document is still loading', () => {
    const checks = buildReleaseNotesEvidenceChecks(dom({ readyState: 'loading' }))
    expect(checks.map((check) => check.tag)).toEqual(['renderer-not-ready'])
  })
})

describe('selectMainWindowTarget', () => {
  const page = (url: string, id = url): DevToolsTarget => ({
    id,
    type: 'page',
    url,
    webSocketDebuggerUrl: `ws://127.0.0.1:9222/devtools/page/${id}`
  })

  it('returns null when nothing is attachable', () => {
    expect(selectMainWindowTarget([])).toBeNull()
    expect(selectMainWindowTarget([{ id: 'a', type: 'service_worker' }])).toBeNull()
  })

  it('ignores a page target with no websocket url', () => {
    expect(selectMainWindowTarget([{ id: 'a', type: 'page', url: 'app://index.html' }])).toBeNull()
  })

  /**
   * The race this exists to remove: on first launch CoreBox and plugin Surfaces are also `page`
   * targets, and taking the first one screenshots whichever happened to come up first.
   */
  it('prefers the main window over CoreBox and plugin surfaces', () => {
    const targets = [
      page('app://corebox/index.html', 'corebox'),
      page('http://127.0.0.1:5173/plugin/demo', 'plugin'),
      page('app://index.html#/', 'main')
    ]
    expect(selectMainWindowTarget(targets)?.id).toBe('main')
  })

  it('accepts a dev-server main window', () => {
    expect(selectMainWindowTarget([page('http://localhost:5173/#/', 'dev')])?.id).toBe('dev')
  })

  it('falls back to the first page rather than giving up', () => {
    expect(selectMainWindowTarget([page('app://something-else', 'x')])?.id).toBe('x')
  })
})

describe('expressions and artefact names', () => {
  it('reads every field the judge consumes', () => {
    const source = readReleaseNotesDomExpression()
    for (const field of [
      'readyState',
      'hasDialog',
      'dialogVersionCount',
      'dialogSummaryCount',
      'hasDialogActions',
      'hash',
      'hasSettingsPage'
    ]) {
      expect(source, field).toContain(field)
    }
  })

  /** A selector typo is invisible at runtime — the query just returns nothing and the check fails. */
  it('queries the class names the dialog actually renders', () => {
    const source = readReleaseNotesDomExpression()
    expect(source).toContain('.whats-changed-dialog')
    expect(source).toContain('.whats-changed-dialog__version-title')
    expect(source).toContain('.whats-changed-dialog__summary li')
    expect(source).toContain('.whats-changed-dialog__actions')
    expect(source).toContain('.SettingsPage')
  })

  it('navigates to the hash the judge checks for', () => {
    expect(navigateToUpdatePageExpression()).toContain(UPDATE_ROUTE_HASH)
    expect(UPDATE_ROUTE_HASH).toBe('#/setting/update')
  })

  it('captures both widths #482 asks for, and names them apart', () => {
    expect(VIEWPORTS.map((viewport) => viewport.name)).toEqual(['desktop', 'narrow'])
    const names = VIEWPORTS.map((viewport) => screenshotFileName(viewport, 'dialog'))
    expect(new Set(names).size).toBe(names.length)
    expect(names[0]).toContain('1440x1050')
    expect(names[1]).toContain('720x900')
  })
})
