import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { renderWindowsAcceptanceManualEvidenceFields } from '../../../../scripts/windows-acceptance-manual-evidence'
import {
  evaluateManualEvidenceCompletion,
  isManualEvidenceComplete
} from '../../../../scripts/windows-acceptance-verify'
import {
  WINDOWS_ACCEPTANCE_MANIFEST_SCHEMA,
  WINDOWS_REQUIRED_CASE_IDS
} from './windows-acceptance-manifest-verifier'

const execFileAsync = promisify(execFile)

async function writeAcceptanceFixture(manualEvidence: string): Promise<string> {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), 'windows-acceptance-verify-'))
  const casesDir = path.join(fixtureDir, 'cases')
  const manualDir = path.join(fixtureDir, 'manual')
  await mkdir(casesDir, { recursive: true })
  await mkdir(manualDir, { recursive: true })

  const cases = WINDOWS_REQUIRED_CASE_IDS.map((caseId) => {
    const evidencePath = `cases/${caseId}.json`
    return {
      caseId,
      status: 'passed' as const,
      requiredForRelease: true,
      evidence: [{ path: evidencePath }]
    }
  })

  for (const testCase of cases) {
    await writeFile(path.join(fixtureDir, testCase.evidence[0].path), '{}\n', 'utf8')
  }

  await writeFile(path.join(manualDir, 'copied-app-path-index.md'), manualEvidence, 'utf8')

  const manifestPath = path.join(fixtureDir, 'windows-acceptance.json')
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      schema: WINDOWS_ACCEPTANCE_MANIFEST_SCHEMA,
      generatedAt: '2026-05-11T00:00:00.000Z',
      platform: 'win32',
      cases,
      manualChecks: {
        copiedAppPath: {
          copiedPathCaptured: true,
          addToLocalLaunchAreaTriggered: true,
          localLaunchEntryCreated: true,
          reindexCompleted: true,
          searchHitAfterReindex: true,
          launchSucceededFromIndexedResult: true,
          evidencePath: 'manual/copied-app-path-index.md'
        }
      }
    })}\n`,
    'utf8'
  )

  return manifestPath
}

async function runAcceptanceVerify(manifestPath: string): Promise<{
  exitCode: number
  stdout: string
  stderr: string
}> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'pnpm',
      [
        'exec',
        'tsx',
        'scripts/windows-acceptance-verify.ts',
        '--input',
        manifestPath,
        '--requireCompletedManualEvidence',
        '--compact'
      ],
      {
        cwd: process.cwd(),
        timeout: 30_000
      }
    )
    return { exitCode: 0, stdout, stderr }
  } catch (error) {
    const childError = error as {
      code?: number
      stdout?: string
      stderr?: string
    }
    return {
      exitCode: childError.code ?? 1,
      stdout: childError.stdout ?? '',
      stderr: childError.stderr ?? ''
    }
  }
}

async function writeTemplateFixture(): Promise<string> {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), 'windows-acceptance-template-'))
  const manifestPath = path.join(fixtureDir, 'windows-acceptance.json')

  await execFileAsync(
    'pnpm',
    [
      'exec',
      'tsx',
      'scripts/windows-acceptance-template.ts',
      '--output',
      manifestPath,
      '--evidenceDir',
      'evidence/windows',
      '--writeManualEvidenceTemplates',
      '--compact'
    ],
    {
      cwd: process.cwd(),
      timeout: 30_000
    }
  )

  return manifestPath
}

async function writeTemplateFixtureWithCollectionPlan(): Promise<{
  fixtureDir: string
  manifestPath: string
}> {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), 'windows-acceptance-template-'))
  const manifestPath = path.join(fixtureDir, 'windows-acceptance.json')

  await execFileAsync(
    'pnpm',
    [
      'exec',
      'tsx',
      'scripts/windows-acceptance-template.ts',
      '--output',
      manifestPath,
      '--evidenceDir',
      'evidence/windows',
      '--writeCollectionPlan',
      '--compact'
    ],
    {
      cwd: process.cwd(),
      timeout: 30_000
    }
  )

  return { fixtureDir, manifestPath }
}

describe('windows-acceptance-verify script', () => {
  it('keeps copied app path template fields aligned with required manual evidence labels', () => {
    expect(renderWindowsAcceptanceManualEvidenceFields('copiedAppPath')).toBe(
      [
        '- Copied source:',
        '- Normalized app path:',
        '- Add-to-local-launch-area action:',
        '- Local launch entry:',
        '- App Index diagnostic evidence path:',
        '- Search query used after reindex:',
        '- Indexed search result:',
        '- Indexed result launch evidence:',
        '- Screenshot or recording:'
      ].join('\n')
    )
  })

  it('keeps Windows update install evidence labels aligned with install handoff checks', () => {
    expect(renderWindowsAcceptanceManualEvidenceFields('updateInstall')).toBe(
      [
        '- Update diagnostic evidence path:',
        '- Installer path:',
        '- Installer mode:',
        '- UAC prompt evidence:',
        '- App exit evidence:',
        '- Installer exit evidence:',
        '- Installed version evidence:',
        '- App relaunch evidence:',
        '- Failure rollback evidence:',
        '- Screenshot or recording:'
      ].join('\n')
    )
  })

  it('keeps common app launch evidence labels aligned with visible app launch checks', () => {
    expect(renderWindowsAcceptanceManualEvidenceFields('commonAppLaunch')).toBe(
      [
        '- Screenshot or recording:',
        '- Search query used:',
        '- Observed display name:',
        '- Icon evidence:',
        '- Observed launch target:',
        '- CoreBox hidden evidence:'
      ].join('\n')
    )
  })

  it('keeps DivisionBox detached widget evidence labels tied to session and payload identity', () => {
    expect(renderWindowsAcceptanceManualEvidenceFields('divisionBoxDetachedWidget')).toBe(
      [
        '- Search query:',
        '- Detached URL/session identifier:',
        '- Detached URL source pluginId:',
        '- Detached URL providerSource:',
        '- Observed session pluginId:',
        '- Expected feature pluginId:',
        '- detachedPayload itemId:',
        '- detachedPayload query:',
        '- Screenshot or recording:',
        '- No fallback mismatch log excerpt:'
      ].join('\n')
    )
  })

  it('rejects checked manual evidence templates without filled evidence fields', () => {
    expect(
      isManualEvidenceComplete(`# Copied App Path Index Evidence

## Required Checks

- [x] Copied source path or command line is recorded.
- [x] Add-to-local-launch-area action is triggered from the copied app path.

## Evidence

- Copied source:
- Normalized app path:
- Screenshot or recording:
- Notes: All checks passed.
`)
    ).toBe(false)
  })

  it('reports manual evidence completion failures with missing labels', () => {
    expect(
      evaluateManualEvidenceCompletion(
        `# Copied App Path Index Evidence

## Required Checks

- [x] Copied source path or command line is recorded.
- [ ] Add-to-local-launch-area action is triggered from the copied app path.

## Evidence

- Copied source: C:\\Tools\\Demo\\Demo.exe
- Normalized app path:
- Local launch entry:
- Notes:
`,
        ['Copied source', 'Normalized app path', 'Local launch entry']
      )
    ).toEqual({
      complete: false,
      failures: [
        'unchecked checklist items: 1',
        'missing evidence fields: Normalized app path, Local launch entry'
      ]
    })
  })

  it('rejects manual evidence with unchecked checklist items', () => {
    expect(
      isManualEvidenceComplete(`# Windows Update Install Evidence

## Required Checks

- [x] Installer launched.
- [ ] Installed version matches the target version.

## Evidence

- Update diagnostic evidence path: evidence/windows/update.json
`)
    ).toBe(false)
  })

  it('accepts completed manual evidence with a non-placeholder evidence value', () => {
    expect(
      isManualEvidenceComplete(`# Time-Aware Recommendation Evidence

## Required Checks

- [x] Empty query recommendations are shown.
- [x] Morning recommendation sample is captured.

## Evidence

- Morning top recommendations: Calculator, WeChat, Codex
- Notes:
`)
    ).toBe(true)
  })

  it('rejects manual evidence that only fills one field when key labels are required', () => {
    expect(
      isManualEvidenceComplete(
        `# Copied App Path Index Evidence

## Required Checks

- [x] Copied source path or command line is recorded.
- [x] Add-to-local-launch-area action is triggered from the copied app path.
- [x] Local launch entry is created.
- [x] Reindex completes.
- [x] Search result appears after reindex.
- [x] Launch succeeds from the indexed result.

## Evidence

- Copied source: C:\\Tools\\Demo\\Demo.exe
- Normalized app path:
- Add-to-local-launch-area action:
- Local launch entry:
- App Index diagnostic evidence path:
- Search query used after reindex:
- Indexed search result:
- Indexed result launch evidence:
- Screenshot or recording:
- Notes:
`,
        [
          'Copied source',
          'Normalized app path',
          'Add-to-local-launch-area action',
          'Local launch entry',
          'App Index diagnostic evidence path',
          'Search query used after reindex',
          'Indexed search result',
          'Indexed result launch evidence',
          'Screenshot or recording'
        ]
      )
    ).toBe(false)
  })

  it('accepts manual evidence when all required evidence labels are filled', () => {
    expect(
      isManualEvidenceComplete(
        `# Copied App Path Index Evidence

## Required Checks

- [x] Copied source path or command line is recorded.
- [x] Add-to-local-launch-area action is triggered from the copied app path.
- [x] Local launch entry is created.
- [x] Reindex completes.
- [x] Search result appears after reindex.
- [x] Launch succeeds from the indexed result.

## Evidence

- Copied source: C:\\Tools\\Demo\\Demo.exe
- Normalized app path: C:\\Tools\\Demo\\Demo.exe
- Add-to-local-launch-area action: System action executed from CoreBox.
- Local launch entry: local-launch://demo
- App Index diagnostic evidence path: evidence/windows/windows-copied-app-path-index-app-index.json
- Search query used after reindex: demo
- Indexed search result: Demo App from local launch area
- Indexed result launch evidence: evidence/windows/manual/copied-app-path-launch.mp4
- Screenshot or recording: evidence/windows/manual/copied-app-path-index.mp4
- Notes:
`,
        [
          'Copied source',
          'Normalized app path',
          'Add-to-local-launch-area action',
          'Local launch entry',
          'App Index diagnostic evidence path',
          'Search query used after reindex',
          'Indexed search result',
          'Indexed result launch evidence',
          'Screenshot or recording'
        ]
      )
    ).toBe(true)
  })

  it('rejects required manual evidence labels with placeholder values', () => {
    expect(
      isManualEvidenceComplete(
        `# Windows Update Install Evidence

## Required Checks

- [x] UAC prompt was observed when required.
- [x] Installer launched.
- [x] App exited before install handoff.
- [x] Installer exited.
- [x] Installed version matches the target version.
- [x] App relaunch succeeded after install.
- [x] Failure rollback behavior was verified.

## Evidence

- Update diagnostic evidence path: evidence/windows/update.json
- Installer path: C:\\Users\\qa\\Downloads\\Tuff-setup.exe
- Installer mode: windows-auto-installer-handoff
- UAC prompt evidence: evidence/windows/manual/update-uac.png
- App exit evidence: process exited before installer handoff
- Installer exit evidence: installer exited with code 0
- Installed version evidence: 2.4.10-beta.19
- App relaunch evidence: relaunched from Start Menu
- Failure rollback evidence: TODO
- Screenshot or recording: TODO
- Notes:
`,
        [
          'Update diagnostic evidence path',
          'Installer path',
          'Installer mode',
          'UAC prompt evidence',
          'App exit evidence',
          'Installer exit evidence',
          'Installed version evidence',
          'App relaunch evidence',
          'Failure rollback evidence',
          'Screenshot or recording'
        ]
      )
    ).toBe(false)
  })

  it('rejects generated angle-bracket placeholders in manual evidence fields', () => {
    expect(
      isManualEvidenceComplete(
        `# DivisionBox Detached Widget Evidence

## Required Checks

- [x] Plugin feature search result is shown.
- [x] Detached widget window opens.
- [x] Session pluginId matches the feature pluginId.
- [x] Initial state is hydrated before fallback search.
- [x] Detached payload is restored.
- [x] Widget surface renders.
- [x] Original query is preserved.
- [x] No fallback search mismatch occurs.

## Evidence

- Search query: widget demo
- Detached URL/session identifier: tuff://detached/session-1
- Detached URL source pluginId: <detached-url-source-plugin-id>
- Detached URL providerSource: plugin-features
- Observed session pluginId: <observed-session-plugin-id>
- Expected feature pluginId: demo-plugin
- detachedPayload itemId: feature-1
- detachedPayload query: widget demo
- Screenshot or recording: evidence/windows/manual/division-box.mp4
- No fallback mismatch log excerpt: no fallback mismatch
- Notes:
`,
        [
          'Search query',
          'Detached URL/session identifier',
          'Detached URL source pluginId',
          'Detached URL providerSource',
          'Observed session pluginId',
          'Expected feature pluginId',
          'detachedPayload itemId',
          'detachedPayload query',
          'Screenshot or recording',
          'No fallback mismatch log excerpt'
        ]
      )
    ).toBe(false)
  })

  it('rejects CLI manual evidence that lacks copied-app-path key fields', async () => {
    const manifestPath = await writeAcceptanceFixture(`# Copied App Path Index Evidence

## Required Checks

- [x] Copied source path or command line is recorded.
- [x] Add-to-local-launch-area action is triggered from the copied app path.
- [x] Local launch entry is created.
- [x] Reindex completes.
- [x] Search result appears after reindex.
- [x] Launch succeeds from the indexed result.

## Evidence

- Copied source: C:\\Tools\\Demo\\Demo.exe
- Normalized app path:
- Add-to-local-launch-area action:
- Local launch entry:
- App Index diagnostic evidence path:
- Search query used after reindex:
- Indexed search result:
- Indexed result launch evidence:
- Screenshot or recording:
- Notes: All checks passed.
`)

    const result = await runAcceptanceVerify(manifestPath)

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain(
      'Windows acceptance manual evidence checklist or fields are incomplete: manual/copied-app-path-index.md (missing evidence fields: Normalized app path, Add-to-local-launch-area action, Local launch entry, App Index diagnostic evidence path, Search query used after reindex, Indexed search result, Indexed result launch evidence, Screenshot or recording)'
    )
  })

  it('rejects all generated empty manual evidence templates with missing field details', async () => {
    const manifestPath = await writeTemplateFixture()

    const result = await runAcceptanceVerify(manifestPath)
    const verified = JSON.parse(result.stdout) as { gate: { failures: string[] } }
    const manualFailures = verified.gate.failures.filter((failure) =>
      failure.startsWith('Windows acceptance manual evidence checklist or fields are incomplete:')
    )

    expect(result.exitCode).toBe(1)
    expect(manualFailures).toEqual([
      'Windows acceptance manual evidence checklist or fields are incomplete: evidence/windows/manual/common-app-wechat.md (unchecked checklist items: 5; missing evidence fields: Screenshot or recording, Search query used, Observed display name, Icon evidence, Observed launch target, CoreBox hidden evidence)',
      'Windows acceptance manual evidence checklist or fields are incomplete: evidence/windows/manual/common-app-codex.md (unchecked checklist items: 5; missing evidence fields: Screenshot or recording, Search query used, Observed display name, Icon evidence, Observed launch target, CoreBox hidden evidence)',
      'Windows acceptance manual evidence checklist or fields are incomplete: evidence/windows/manual/common-app-apple-music.md (unchecked checklist items: 5; missing evidence fields: Screenshot or recording, Search query used, Observed display name, Icon evidence, Observed launch target, CoreBox hidden evidence)',
      'Windows acceptance manual evidence checklist or fields are incomplete: evidence/windows/manual/copied-app-path-index.md (unchecked checklist items: 6; missing evidence fields: Copied source, Normalized app path, Add-to-local-launch-area action, Local launch entry, App Index diagnostic evidence path, Search query used after reindex, Indexed search result, Indexed result launch evidence, Screenshot or recording)',
      'Windows acceptance manual evidence checklist or fields are incomplete: evidence/windows/manual/windows-update-install.md (unchecked checklist items: 7; missing evidence fields: Update diagnostic evidence path, Installer path, Installer mode, UAC prompt evidence, App exit evidence, Installer exit evidence, Installed version evidence, App relaunch evidence, Failure rollback evidence, Screenshot or recording)',
      'Windows acceptance manual evidence checklist or fields are incomplete: evidence/windows/manual/division-box-detached-widget.md (unchecked checklist items: 8; missing evidence fields: Search query, Detached URL/session identifier, Detached URL source pluginId, Detached URL providerSource, Observed session pluginId, Expected feature pluginId, detachedPayload itemId, detachedPayload query, Screenshot or recording, No fallback mismatch log excerpt)',
      'Windows acceptance manual evidence checklist or fields are incomplete: evidence/windows/manual/time-aware-recommendation.md (unchecked checklist items: 6; missing evidence fields: Morning time/context, Morning top itemId, Morning top sourceId, Morning top recommendations, Afternoon time/context, Afternoon top itemId, Afternoon top sourceId, Afternoon top recommendations, Frequent app used for comparison, Frequent comparison itemId, Frequent comparison sourceId, timeSlot/dayOfWeek cache keys, Screenshot or recording, Recommendation trace log excerpt)'
    ])
  })

  it('writes a Windows evidence collection plan with gate commands', async () => {
    const { fixtureDir } = await writeTemplateFixtureWithCollectionPlan()
    const planPath = path.join(
      fixtureDir,
      'evidence',
      'windows',
      'WINDOWS_ACCEPTANCE_COLLECTION_PLAN.md'
    )
    const plan = await readFile(planPath, 'utf8')

    expect(plan).toContain('# Windows Acceptance Evidence Collection Plan')
    expect(plan).toContain('### windows-everything-file-search')
    expect(plan).toContain(
      'pnpm -C "apps/core-app" run windows:capability:evidence -- --target WeChat --target Codex --target "Apple Music" --output "evidence/windows/windows-everything-file-search-capability.json"'
    )
    expect(plan).toContain('pnpm -C "apps/core-app" run windows:capability:verify')
    expect(plan).toContain(
      '--input "evidence/windows/windows-everything-file-search-capability.json"'
    )
    expect(plan).toContain(
      '--input "evidence/windows/windows-copied-app-path-index-app-index.json"'
    )
    expect(plan).toContain('pnpm -C "apps/core-app" run search:trace:stats')
    expect(plan).toContain('--input "<core-app-log-file>"')
    expect(plan).toContain('--input "evidence/windows/search-trace-stats.json"')
    expect(plan).toContain('pnpm -C "apps/core-app" run clipboard:stress --')
    expect(plan).toContain('--input "evidence/windows/clipboard-stress-summary.json"')
    expect(plan).toContain('--installer "<downloaded-installer-path>"')
    expect(plan).toContain(
      '- DivisionBox detached widget: `evidence/windows/manual/division-box-detached-widget.md`'
    )
    expect(plan).toContain('pnpm -C "apps/core-app" run windows:acceptance:verify -- --input "')
    expect(plan).toContain('--requireCompletedManualEvidence')
    expect(plan).toContain('--requireEvidenceGatePassed')
    expect(plan).toContain('--requireCommonAppTargets WeChat,Codex,"Apple Music"')
    expect(plan).not.toContain('<capability-evidence.json>')
    expect(plan).not.toContain('<everything-evidence.json>')
    expect(plan).not.toContain('<app-index-evidence.json>')
    expect(plan).not.toContain('<update-evidence.json>')
    expect(plan).not.toContain('<search-trace-stats.json>')
    expect(plan).not.toContain('<clipboard-stress-summary.json>')
  })

  it('accepts CLI manual evidence with copied-app-path key fields filled', async () => {
    const manifestPath = await writeAcceptanceFixture(`# Copied App Path Index Evidence

## Required Checks

- [x] Copied source path or command line is recorded.
- [x] Add-to-local-launch-area action is triggered from the copied app path.
- [x] Local launch entry is created.
- [x] Reindex completes.
- [x] Search result appears after reindex.
- [x] Launch succeeds from the indexed result.

## Evidence

- Copied source: C:\\Tools\\Demo\\Demo.exe
- Normalized app path: C:\\Tools\\Demo\\Demo.exe
- Add-to-local-launch-area action: System action executed from CoreBox.
- Local launch entry: local-launch://demo
- App Index diagnostic evidence path: evidence/windows/windows-copied-app-path-index-app-index.json
- Search query used after reindex: demo
- Indexed search result: Demo App from local launch area
- Indexed result launch evidence: evidence/windows/manual/copied-app-path-launch.mp4
- Screenshot or recording: evidence/windows/manual/copied-app-path-index.mp4
- Notes:
`)

    const result = await runAcceptanceVerify(manifestPath)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('"passed":true')
  })
})
