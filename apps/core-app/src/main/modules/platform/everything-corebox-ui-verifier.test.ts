import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EVERYTHING_COREBOX_UI_EVIDENCE_KIND,
  EVERYTHING_COREBOX_UI_EVIDENCE_SCHEMA_VERSION,
  evaluateEverythingCoreBoxUiEvidence,
  isRedactedArtifactPath,
  isRedactedCoreBoxQuery,
  resolveCoreBoxResultSource,
  verifyEverythingCoreBoxUiArtifacts,
  type EverythingCoreBoxModeEvidence,
  type EverythingCoreBoxUiEvidencePayload,
  type EverythingCoreBoxUiGateOptions
} from './everything-corebox-ui-verifier'

/**
 * Contracts these tests defend, and the consumer bug each one would have let through:
 *
 * - `structured-filter` (`ext:txt …`) is routed to the local file index, not Everything. A gate that
 *   attributed it to Everything would fail a genuinely passing Windows run; one that accepted any
 *   source for the Everything-sourced modes would pass a run where Everything never answered.
 * - A rendered row with no attributed provider is a fabricated row, and rows claimed for Everything
 *   while the backend is unavailable are the exact false-green the degraded run must never produce.
 * - The screenshot gate is the difference between "the artifact array lists a filename" and "the
 *   file exists, is inside the evidence root, and is a real PNG". Only the filesystem half of the
 *   gate can catch a missing, truncated, non-PNG or symlink-escaped screenshot.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function mode(over: Partial<EverythingCoreBoxModeEvidence> = {}): EverythingCoreBoxModeEvidence {
  return {
    mode: 'normal',
    query: 'tuff-everything-ci-marker.txt',
    attempted: true,
    resultSource: 'everything-provider',
    rowCount: 3,
    markerMatchCount: 1,
    emptyResult: false,
    noticeVisible: false,
    durationMs: 900,
    screenshot: 'shot-normal.png',
    domSnapshot: 'dom-normal.json',
    ...over
  }
}

/**
 * A healthy packaged run: `normal` and `explicit-file` are answered by Everything, `structured-filter`
 * by the local file index (which is correct — the `ext:` token is claimed before Everything sees it).
 */
function healthyEvidence(
  over: Partial<EverythingCoreBoxUiEvidencePayload> = {}
): EverythingCoreBoxUiEvidencePayload {
  const modes: EverythingCoreBoxModeEvidence[] = [
    mode({ mode: 'normal', screenshot: 'shot-normal.png', domSnapshot: 'dom-normal.json' }),
    mode({
      mode: 'explicit-file',
      query: '@file tuff-everything-ci-marker.txt',
      screenshot: 'shot-explicit.png',
      domSnapshot: 'dom-explicit.json'
    }),
    mode({
      mode: 'structured-filter',
      query: 'ext:txt tuff-everything-ci-marker',
      resultSource: 'file-provider',
      screenshot: 'shot-filter.png',
      domSnapshot: 'dom-filter.json'
    })
  ]
  return {
    schemaVersion: EVERYTHING_COREBOX_UI_EVIDENCE_SCHEMA_VERSION,
    kind: EVERYTHING_COREBOX_UI_EVIDENCE_KIND,
    createdAt: '2026-09-29T00:00:00.000Z',
    runtime: {
      packaged: true,
      mode: 'packaged-app',
      platform: 'win32',
      appVersion: '2.4.14-beta.53',
      profileIsolated: true
    },
    backend: {
      expected: 'sdk-napi',
      observed: 'sdk-napi',
      available: true,
      health: 'ready',
      version: '1.4.1.1026',
      errorCode: null,
      fallbackChain: ['sdk-napi', 'cli'],
      statusChannelAvailable: true
    },
    window: {
      coreBoxVisible: true,
      visibilityState: 'visible',
      resultSurfaceVisible: true,
      screenshotCount: modes.length
    },
    emptyState: {
      query: 'tuff-corebox-empty-state-7c41q9',
      observed: true,
      rowCount: 0,
      reason: null
    },
    degradedState: {
      observed: false,
      zeroResultRows: false,
      coreBoxInteractive: true,
      backend: 'sdk-napi',
      backendReason: null,
      noticeVisible: false
    },
    redaction: {
      queryIncluded: false,
      resultPathsIncluded: false,
      resultTitlesIncluded: false,
      userHomeIncluded: false
    },
    modes,
    artifacts: {
      screenshots: modes.map((entry) => entry.screenshot as string),
      domSnapshots: modes.map((entry) => entry.domSnapshot as string)
    },
    ...over
  }
}

const REQUIRE_AVAILABLE_ALL_MODES: EverythingCoreBoxUiGateOptions = {
  requirePackaged: true,
  requirePlatform: 'win32',
  requireModes: ['normal', 'explicit-file', 'structured-filter'],
  requireBackend: ['sdk-napi', 'cli'],
  requireAvailable: true,
  requireResultRows: true,
  requireMarkerMatches: true,
  requireScreenshots: true,
  requireEmptyState: true
}

describe('resolveCoreBoxResultSource', () => {
  it('attributes a mode to Everything when Everything reported the rows', () => {
    expect(
      resolveCoreBoxResultSource([{ providerId: 'everything-provider', resultCount: 2 }])
    ).toBe('everything-provider')
  })

  /**
   * Everything and the local index can both answer `@file`. Everything must win the attribution so
   * the evidence records the provider the gate actually required, not whichever source happened to
   * also return rows.
   */
  it('prefers Everything over a local file provider that also reported rows', () => {
    expect(
      resolveCoreBoxResultSource([
        { providerId: 'file-provider', resultCount: 5 },
        { providerId: 'everything-provider', resultCount: 1 }
      ])
    ).toBe('everything-provider')
  })

  it('attributes a mode to the local file provider when only it reported rows', () => {
    expect(resolveCoreBoxResultSource([{ providerId: 'file-provider', resultCount: 4 }])).toBe(
      'file-provider'
    )
  })

  /**
   * A non-file provider (a conversation, a plugin) with rows is not a file result. Calling it
   * `file-provider` would let a non-file answer satisfy the file-source requirement.
   */
  it('returns none for a non-file provider that reported rows', () => {
    expect(
      resolveCoreBoxResultSource([{ providerId: 'conversation-provider', resultCount: 6 }])
    ).toBe('none')
  })

  it('returns none when no provider reported rows', () => {
    expect(resolveCoreBoxResultSource([{ providerId: 'file-provider', resultCount: 0 }])).toBe('none')
  })
})

describe('evaluateEverythingCoreBoxUiEvidence source attribution', () => {
  it('passes a healthy packaged run where only the structured filter lands on the file index', () => {
    expect(evaluateEverythingCoreBoxUiEvidence(healthyEvidence(), REQUIRE_AVAILABLE_ALL_MODES)).toEqual(
      { passed: true, failures: [], warnings: [] }
    )
  })

  /**
   * The false-pass the gate exists to stop: `normal` is an Everything-sourced mode, so a run where
   * the local index answered it (Everything never reached the query) must not be green.
   */
  it('fails an Everything-sourced mode that was answered by the local file index instead', () => {
    const evidence = healthyEvidence()
    const normal = evidence.modes.find((entry) => entry.mode === 'normal')!
    normal.resultSource = 'file-provider'

    const gate = evaluateEverythingCoreBoxUiEvidence(evidence, REQUIRE_AVAILABLE_ALL_MODES)
    expect(gate.passed).toBe(false)
    expect(gate.failures).toContain(
      'Everything CoreBox UI evidence normal search was not answered by Everything'
    )
  })

  /**
   * The complement: `structured-filter` is *meant* to be answered by the file index. A gate that
   * demanded Everything here would fail every real Windows run.
   */
  it('accepts the structured filter being answered by the local file index', () => {
    expect(
      evaluateEverythingCoreBoxUiEvidence(healthyEvidence(), REQUIRE_AVAILABLE_ALL_MODES).passed
    ).toBe(true)
  })

  it('fails rows that were rendered with no attributed provider', () => {
    const evidence = healthyEvidence()
    const normal = evidence.modes.find((entry) => entry.mode === 'normal')!
    normal.resultSource = 'none'

    expect(
      evaluateEverythingCoreBoxUiEvidence(evidence, REQUIRE_AVAILABLE_ALL_MODES).failures
    ).toContain('Everything CoreBox UI evidence normal rendered rows without an attributed provider')
  })

  it('fails Everything rows claimed while the backend was unavailable', () => {
    const evidence = healthyEvidence()
    evidence.backend = {
      ...evidence.backend,
      expected: 'unavailable',
      observed: 'unavailable',
      available: false,
      errorCode: 'EVERYTHING_NOT_INSTALLED',
      fallbackChain: []
    }

    expect(
      evaluateEverythingCoreBoxUiEvidence(evidence, REQUIRE_AVAILABLE_ALL_MODES).failures
    ).toContain(
      'Everything CoreBox UI evidence normal claims Everything rows with an unavailable backend'
    )
  })

  it('fails an evidence payload from an unsupported schema version', () => {
    const stale = {
      ...healthyEvidence(),
      schemaVersion: EVERYTHING_COREBOX_UI_EVIDENCE_SCHEMA_VERSION + 1
    } as unknown as EverythingCoreBoxUiEvidencePayload
    expect(evaluateEverythingCoreBoxUiEvidence(stale).failures).toContain(
      'unsupported Everything CoreBox UI evidence schema'
    )
  })

  /**
   * The bug: a degraded run renders an unavailable notice row (`.BoxItem--notice`), which is not a
   * file result. Counting it as rows would either fail a correct degraded run or, worse, let a
   * fabricated file row hide behind the notice. The degraded judge keys off `zeroResultRows`, so a
   * backend-down run with only a notice must pass and a run claiming file rows must not.
   */
  it('passes a degraded run that rendered only a notice row and no file rows', () => {
    const evidence = healthyEvidence()
    evidence.backend = {
      ...evidence.backend,
      expected: 'unavailable',
      observed: 'unavailable',
      available: false,
      errorCode: 'EVERYTHING_NOT_INSTALLED',
      health: 'unsupported',
      fallbackChain: []
    }
    evidence.modes = evidence.modes.map((entry) => ({
      ...entry,
      rowCount: 0,
      markerMatchCount: 0,
      emptyResult: true,
      noticeVisible: true,
      resultSource: 'none'
    }))
    evidence.degradedState = {
      observed: true,
      zeroResultRows: true,
      coreBoxInteractive: true,
      backend: 'unavailable',
      backendReason: 'everything-not-installed',
      noticeVisible: true
    }
    evidence.emptyState = { query: 'tuff-corebox-empty-state-7c41q9', observed: true, rowCount: 0, reason: null }

    const gate = evaluateEverythingCoreBoxUiEvidence(evidence, {
      requirePackaged: true,
      requirePlatform: 'win32',
      requireModes: ['normal', 'explicit-file', 'structured-filter'],
      requireBackend: ['unavailable'],
      requireDegraded: true,
      requireScreenshots: true,
      requireResultRows: true
    })
    expect(gate.passed).toBe(true)
  })

  it('fails a degraded run that claims file rows despite the backend being unavailable', () => {
    const evidence = healthyEvidence()
    evidence.backend = {
      ...evidence.backend,
      expected: 'unavailable',
      observed: 'unavailable',
      available: false,
      errorCode: 'EVERYTHING_NOT_INSTALLED',
      fallbackChain: []
    }
    evidence.degradedState = {
      observed: true,
      zeroResultRows: false,
      coreBoxInteractive: true,
      backend: 'unavailable',
      backendReason: 'everything-not-installed',
      noticeVisible: true
    }
    evidence.modes = evidence.modes.map((entry) => ({
      ...entry,
      resultSource: entry.mode === 'structured-filter' ? 'file-provider' : 'everything-provider',
      noticeVisible: true
    }))

    const failures = evaluateEverythingCoreBoxUiEvidence(evidence, {
      requirePackaged: true,
      requirePlatform: 'win32',
      requireModes: ['normal', 'explicit-file', 'structured-filter'],
      requireBackend: ['unavailable'],
      requireDegraded: true,
      requireResultRows: true
    }).failures
    expect(failures).toContain(
      'Everything CoreBox UI evidence degraded state fabricated result rows'
    )
    expect(
      failures.some((failure) => failure.includes('claims Everything rows with an unavailable backend'))
    ).toBe(true)
  })
})

describe('redaction predicates', () => {
  it('keeps probe-owned query labels but rejects anything that is a real path or user text', () => {
    expect(isRedactedCoreBoxQuery('tuff-everything-ci-marker.txt')).toBe(true)
    expect(isRedactedCoreBoxQuery('ext:txt tuff-everything-ci-marker')).toBe(true)
    expect(isRedactedCoreBoxQuery('C:\\Users\\qa\\secret.txt')).toBe(false)
    expect(isRedactedCoreBoxQuery('/Users/qa/secret.txt')).toBe(false)
    expect(isRedactedCoreBoxQuery('~/secret')).toBe(false)
    expect(isRedactedCoreBoxQuery('   ')).toBe(false)
  })

  it('keeps relative artifact names but rejects absolute or traversing ones', () => {
    expect(isRedactedArtifactPath('corebox-everything-normal.png')).toBe(true)
    expect(isRedactedArtifactPath('../escape.png')).toBe(false)
    expect(isRedactedArtifactPath('/etc/passwd')).toBe(false)
    expect(isRedactedArtifactPath('C:\\x.png')).toBe(false)
    expect(isRedactedArtifactPath('sub\\x.png')).toBe(false)
  })
})

describe('verifyEverythingCoreBoxUiArtifacts', () => {
  async function withRoot<T>(body: (root: string) => Promise<T>): Promise<T> {
    const base = await mkdtemp(path.join(os.tmpdir(), 'tuff-corebox-artifacts-'))
    try {
      return await body(base)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  }

  async function writeRealPng(file: string): Promise<void> {
    await writeFile(file, Buffer.concat([PNG_SIGNATURE, Buffer.alloc(64, 7)]))
  }

  it('passes when every listed screenshot is a real PNG inside the evidence root', async () => {
    await withRoot(async (root) => {
      const evidence = healthyEvidence()
      for (const name of evidence.artifacts.screenshots) await writeRealPng(path.join(root, name))
      for (const name of evidence.artifacts.domSnapshots) {
        await writeFile(path.join(root, name), '{"dom":true}\n')
      }

      await expect(
        verifyEverythingCoreBoxUiArtifacts(evidence, { baseDir: root, requireScreenshots: true })
      ).resolves.toEqual({ passed: true, failures: [] })
    })
  })

  it('rejects a listed screenshot whose file is missing', async () => {
    await withRoot(async (root) => {
      const evidence = healthyEvidence()
      for (const name of evidence.artifacts.domSnapshots) {
        await writeFile(path.join(root, name), '{"dom":true}\n')
      }
      const gate = await verifyEverythingCoreBoxUiArtifacts(evidence, {
        baseDir: root,
        requireScreenshots: true
      })
      expect(gate.passed).toBe(false)
      expect(gate.failures.some((failure) => failure.includes('shot-normal.png'))).toBe(true)
    })
  })

  it('rejects a listed screenshot that is a zero-byte file', async () => {
    await withRoot(async (root) => {
      const evidence = healthyEvidence()
      for (const name of evidence.artifacts.domSnapshots) {
        await writeFile(path.join(root, name), '{"dom":true}\n')
      }
      await writeFile(path.join(root, 'shot-normal.png'), Buffer.alloc(0))

      const gate = await verifyEverythingCoreBoxUiArtifacts(evidence, { baseDir: root })
      expect(gate.failures).toContain(
        'Everything CoreBox UI evidence screenshot is empty: shot-normal.png'
      )
    })
  })

  /**
   * A truncated screenshot: the right prefix was cut before the eight-byte signature completed. The
   * artifact array still names a file, and `stat` reports non-zero bytes, so only a real byte check
   * catches it.
   */
  it('rejects a screenshot truncated before the PNG signature completes', async () => {
    await withRoot(async (root) => {
      const evidence = healthyEvidence()
      for (const name of evidence.artifacts.domSnapshots) {
        await writeFile(path.join(root, name), '{"dom":true}\n')
      }
      await writeFile(path.join(root, 'shot-normal.png'), PNG_SIGNATURE.subarray(0, 4))

      const gate = await verifyEverythingCoreBoxUiArtifacts(evidence, { baseDir: root })
      expect(gate.failures).toContain(
        'Everything CoreBox UI evidence screenshot is not a PNG: shot-normal.png'
      )
    })
  })

  it('rejects a non-PNG file listed as a screenshot', async () => {
    await withRoot(async (root) => {
      const evidence = healthyEvidence()
      for (const name of evidence.artifacts.domSnapshots) {
        await writeFile(path.join(root, name), '{"dom":true}\n')
      }
      await writeFile(path.join(root, 'shot-normal.png'), Buffer.from('GIF89a-not-a-png'))

      const gate = await verifyEverythingCoreBoxUiArtifacts(evidence, { baseDir: root })
      expect(gate.failures).toContain(
        'Everything CoreBox UI evidence screenshot is not a PNG: shot-normal.png'
      )
    })
  })

  /**
   * A relative name that traverses out of the evidence root must be refused before any read. The
   * redaction predicate catches the `..` form; the canonical-path check catches a symlink that has
   * no `..` in its name at all.
   */
  it('rejects a traversal name without reading outside the evidence root', async () => {
    await withRoot(async (root) => {
      const evidence = healthyEvidence()
      for (const name of evidence.artifacts.domSnapshots) {
        await writeFile(path.join(root, name), '{"dom":true}\n')
      }
      evidence.artifacts.screenshots = [...evidence.artifacts.screenshots, '../escape.png']

      const gate = await verifyEverythingCoreBoxUiArtifacts(evidence, { baseDir: root })
      expect(gate.passed).toBe(false)
      expect(gate.failures.some((failure) => failure.includes('../escape.png'))).toBe(true)
    })
  })

  it('rejects a symlinked screenshot that points outside the evidence root', async () => {
    await withRoot(async (root) => {
      const outside = await mkdtemp(path.join(os.tmpdir(), 'tuff-corebox-outside-'))
      try {
        const target = path.join(outside, 'real.png')
        await writeRealPng(target)
        const evidence = healthyEvidence()
        for (const name of evidence.artifacts.domSnapshots) {
          await writeFile(path.join(root, name), '{"dom":true}\n')
        }
        await symlink(target, path.join(root, 'shot-normal.png'))

        const gate = await verifyEverythingCoreBoxUiArtifacts(evidence, { baseDir: root })
        expect(gate.passed).toBe(false)
        expect(gate.failures.some((failure) => failure.includes('shot-normal.png'))).toBe(true)
      } finally {
        await rm(outside, { recursive: true, force: true })
      }
    })
  })

  it('requires an artifact root before it can verify screenshots', async () => {
    const gate = await verifyEverythingCoreBoxUiArtifacts(healthyEvidence(), {
      requireScreenshots: true
    })
    expect(gate.passed).toBe(false)
    expect(gate.failures).toContain(
      'Everything CoreBox UI evidence artifact root is required to verify screenshots'
    )
  })

  it('rejects a mode screenshot that is not listed in the artifact array', async () => {
    await withRoot(async (root) => {
      const evidence = healthyEvidence()
      for (const name of evidence.artifacts.screenshots) await writeRealPng(path.join(root, name))
      for (const name of evidence.artifacts.domSnapshots) {
        await writeFile(path.join(root, name), '{"dom":true}\n')
      }
      evidence.artifacts.screenshots = evidence.artifacts.screenshots.filter(
        (name) => name !== 'shot-normal.png'
      )

      const gate = await verifyEverythingCoreBoxUiArtifacts(evidence, { baseDir: root })
      expect(gate.passed).toBe(false)
      expect(
        gate.failures.some((failure) => failure.includes('outside the screenshot artifact list'))
      ).toBe(true)
    })
  })

  it('rejects an empty screenshot artifact list when screenshots are required', async () => {
    await withRoot(async (root) => {
      const evidence = healthyEvidence()
      evidence.artifacts.screenshots = []

      const gate = await verifyEverythingCoreBoxUiArtifacts(evidence, {
        baseDir: root,
        requireScreenshots: true
      })
      expect(gate.failures).toContain(
        'Everything CoreBox UI evidence carries no screenshot artifacts'
      )
    })
  })

  it('rejects a dom snapshot whose file is missing', async () => {
    await withRoot(async (root) => {
      const evidence = healthyEvidence()
      for (const name of evidence.artifacts.screenshots) await writeRealPng(path.join(root, name))

      const gate = await verifyEverythingCoreBoxUiArtifacts(evidence, { baseDir: root })
      expect(gate.passed).toBe(false)
      expect(gate.failures.some((failure) => failure.includes('dom-normal.json'))).toBe(true)
    })
  })
})
