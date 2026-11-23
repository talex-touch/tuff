import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkApiProbes,
  checkDeployedPreviewEvidence,
  checkWranglerEvidence,
  createDeployedPreviewEvidenceTemplate,
  DEFAULT_LOCAL_API_MAX_DURATION_MS,
  DEPLOYED_PREVIEW_API_MAX_DURATION_MS,
  verifyRuntimeEvidence,
} from './check-runtime-evidence.mjs'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir)
      rmSync(dir, { recursive: true, force: true })
  }
})

function createTempWorkspace(): { rootDir: string, evidenceDir: string } {
  const rootDir = mkdtempSync(join(tmpdir(), 'nexus-runtime-evidence-'))
  tempDirs.push(rootDir)
  const evidenceDir = join(rootDir, 'output/playwright')
  mkdirSync(evidenceDir, { recursive: true })
  return { rootDir, evidenceDir }
}

function buildValidDeployedEvidence() {
  const template = createDeployedPreviewEvidenceTemplate()
  const prefix = 'nexus-cloudflare-pages-preview-runtime-smoke-2026-11-23'
  template.baseUrl = 'https://tuff.tagzxia.com'
  template.routes = template.routes.map(route => ({
    ...route,
    har: route.har.replace('nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD', prefix),
  }))
  template.bfcache.har = template.bfcache.har.replace('nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD', prefix)
  template.authProviderCallback.har = template.authProviderCallback.har.replace('nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD', prefix)
  template.authenticatedDashboard.har = template.authenticatedDashboard.har.replace('nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD', prefix)
  return { prefix, evidence: template }
}

function renderDeployedMarkdown(evidence: ReturnType<typeof createDeployedPreviewEvidenceTemplate>) {
  return [
    '# Nexus Cloudflare Pages Preview Runtime Smoke',
    '',
    `- Status: ${evidence.status}`,
    `- Base URL: ${evidence.baseUrl}`,
    `- Real provider callback authenticated: ${Boolean(evidence.authProviderCallback?.authenticated)}`,
    `- Authenticated dashboard smoke: ${Boolean(evidence.authenticatedDashboard?.authenticated)}`,
    `- Real bfcache hit observed: ${evidence.bfcache?.realBfcacheHit}`,
    '',
  ].join('\n')
}

function writeDeployedFixtures(
  rootDir: string,
  evidenceDir: string,
  prefix: string,
  evidence: ReturnType<typeof createDeployedPreviewEvidenceTemplate>,
  options: { omitHar?: string, markdownOverride?: string } = {},
) {
  writeFileSync(join(evidenceDir, `${prefix}.json`), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  writeFileSync(join(evidenceDir, `${prefix}.md`), options.markdownOverride ?? renderDeployedMarkdown(evidence), 'utf8')

  const hars = [
    ...evidence.routes.map(route => route.har),
    evidence.bfcache.har,
    evidence.authProviderCallback.har,
    evidence.authenticatedDashboard.har,
  ].filter(Boolean)

  for (const harRelPath of hars) {
    if (options.omitHar && harRelPath.endsWith(options.omitHar))
      continue
    const harFullPath = join(rootDir, harRelPath)
    mkdirSync(dirname(harFullPath), { recursive: true })
    writeFileSync(harFullPath, '{"log":{"entries":[]}}\n', 'utf8')
  }
}

describe('check-runtime-evidence API bounds and --deployed-only mode', () => {
  it('accepts current live docs byte bounds while still rejecting out-of-range payloads', () => {
    const { evidence } = buildValidDeployedEvidence()
    const bodyProbe = evidence.api.find(item => item.name === 'docs page full body')!
    const sidebarProbe = evidence.api.find(item => item.name === 'docs sidebar components')!

    // Observed live values on https://tuff.tagzxia.com (2026-11-23).
    bodyProbe.bytes = 19_938
    sidebarProbe.bytes = 81_835
    expect(checkApiProbes(evidence.api)).toEqual([])

    // Exact boundary values pass.
    bodyProbe.bytes = 15_000
    sidebarProbe.bytes = 120_000
    expect(checkApiProbes(evidence.api)).toEqual([])

    bodyProbe.bytes = 45_000
    sidebarProbe.bytes = 30_000
    expect(checkApiProbes(evidence.api)).toEqual([])

    // Just outside bounds fails.
    bodyProbe.bytes = 14_999
    sidebarProbe.bytes = 120_001
    expect(checkApiProbes(evidence.api)).toEqual([
      'API probe docs page full body returned 14999 bytes, expected 15000..45000',
      'API probe docs sidebar components returned 120001 bytes, expected 30000..120000',
    ])

    bodyProbe.bytes = 45_001
    sidebarProbe.bytes = 29_999
    expect(checkApiProbes(evidence.api)).toEqual([
      'API probe docs page full body returned 45001 bytes, expected 15000..45000',
      'API probe docs sidebar components returned 29999 bytes, expected 30000..120000',
    ])
  })

  it('keeps local Wrangler API duration strict at <= 1000ms while allowing <= 5000ms for deployed preview', () => {
    expect(DEFAULT_LOCAL_API_MAX_DURATION_MS).toBe(1_000)
    expect(DEPLOYED_PREVIEW_API_MAX_DURATION_MS).toBe(5_000)

    const { evidence } = buildValidDeployedEvidence()
    const firstProbe = evidence.api[0]!

    // Cold TLS + edge RTT observed at 2,796ms passes deployed preview, fails local Wrangler.
    firstProbe.durationMs = 2_796
    expect(checkDeployedPreviewEvidence(evidence)).toEqual([])
    expect(checkApiProbes(evidence.api)).toEqual([
      `API probe ${firstProbe.name} took 2796ms, expected <= 1000ms`,
    ])

    // Wrangler evidence keeps the strict <= 1000ms local gate.
    const wranglerFindings = checkWranglerEvidence({
      status: 'PASS',
      failures: [],
      warnings: [],
      sourceGuards: { authHandlerSingleton: true },
      build: evidence.build,
      api: evidence.api,
      routes: evidence.routes,
      networkSummary: evidence.networkSummary,
      consoleSummary: { errors: [] },
      bfcache: evidence.bfcache,
    })
    expect(wranglerFindings).toEqual([
      `API probe ${firstProbe.name} took 2796ms, expected <= 1000ms`,
    ])

    // Deployed preview still rejects durations above 5000ms.
    firstProbe.durationMs = 5_000
    expect(checkDeployedPreviewEvidence(evidence)).toEqual([])

    firstProbe.durationMs = 5_001
    expect(checkDeployedPreviewEvidence(evidence)).toEqual([
      `API probe ${firstProbe.name} took 5001ms, expected <= 5000ms`,
    ])
  })

  it('validates deployed preview sidecars, markdown summary, and gates under --deployed-only without local wrangler/pwa files', () => {
    const { rootDir, evidenceDir } = createTempWorkspace()
    const { prefix, evidence } = buildValidDeployedEvidence()
    evidence.api.find(item => item.name === 'docs page full body')!.bytes = 19_938
    evidence.api.find(item => item.name === 'docs sidebar components')!.bytes = 81_835
    evidence.api[0]!.durationMs = 2_796

    writeDeployedFixtures(rootDir, evidenceDir, prefix, evidence)

    const deployedOnlyResult = verifyRuntimeEvidence({
      deployedOnly: true,
      rootDir,
      evidenceDir,
    })
    expect(deployedOnlyResult.ok).toBe(true)
    expect(deployedOnlyResult.error).toBeNull()
    expect(deployedOnlyResult.findings).toEqual([])
    expect(deployedOnlyResult.wranglerEvidence).toBeNull()
    expect(deployedOnlyResult.pwaEvidence).toBeNull()
    expect(deployedOnlyResult.deployedPreviewEvidence?.fileName).toBe(`${prefix}.json`)

    // Default mode and --require-deployed-preview remain unchanged and still require local wrangler/pwa evidence.
    const defaultResult = verifyRuntimeEvidence({ rootDir, evidenceDir })
    expect(defaultResult.ok).toBe(false)
    expect(defaultResult.error).toContain('nexus-wrangler-prod-runtime-smoke-')

    const requireDeployedResult = verifyRuntimeEvidence({
      requireDeployedPreview: true,
      rootDir,
      evidenceDir,
    })
    expect(requireDeployedResult.ok).toBe(false)
    expect(requireDeployedResult.error).toContain('nexus-wrangler-prod-runtime-smoke-')
  })

  it('enforces sidecars, markdown summary, auth, bfcache, and route budgets in --deployed-only mode', () => {
    const { rootDir, evidenceDir } = createTempWorkspace()
    const { prefix, evidence } = buildValidDeployedEvidence()
    evidence.bfcache.realBfcacheHit = false
    evidence.authProviderCallback.errorBoundaryOnly = true

    writeDeployedFixtures(rootDir, evidenceDir, prefix, evidence, {
      omitHar: '-home.har',
      markdownOverride: '# Stale summary\n- Status: PASS\n',
    })

    const result = verifyRuntimeEvidence({
      deployedOnly: true,
      rootDir,
      evidenceDir,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBeNull()
    expect(result.findings).toContain(`missing runtime evidence sidecar: output/playwright/${prefix}-home.har`)
    expect(result.findings.some(finding => finding.includes('deployed Cloudflare preview markdown summary is stale or missing'))).toBe(true)
    expect(result.findings).toContain('deployed Cloudflare preview did not prove a real bfcache hit')
    expect(result.findings).toContain('deployed Cloudflare preview auth provider callback only covered the error boundary')
  })
})
