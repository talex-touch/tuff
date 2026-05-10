import { describe, expect, it } from 'vitest'
import type { AppIndexDiagnosticEvidencePayload } from './app-index-diagnostic-verifier'
import {
  evaluateAppIndexDiagnosticEvidence,
  verifyAppIndexDiagnosticEvidence
} from './app-index-diagnostic-verifier'

function buildEvidence(
  overrides: Partial<AppIndexDiagnosticEvidencePayload> = {}
): AppIndexDiagnosticEvidencePayload {
  return {
    schemaVersion: 1,
    kind: 'app-index-diagnostic-evidence',
    createdAt: '2026-05-10T08:00:00.000Z',
    input: {
      target: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      query: 'calc'
    },
    diagnosis: {
      success: true,
      status: 'found',
      target: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      matchedStages: ['phrase', 'fts']
    },
    app: {
      id: 42,
      path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      name: 'Calculator',
      displayName: 'Calculator',
      rawDisplayName: 'Calculator',
      displayNameStatus: 'clean',
      bundleId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe',
      appIdentity: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      launchKind: 'uwp',
      launchTarget: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      alternateNames: ['Calculator'],
      entryEnabled: true
    },
    index: {
      itemId: 'app:42',
      itemIds: ['app:42'],
      aliases: ['calculator'],
      generatedKeywords: ['calculator'],
      storedKeywords: ['calc'],
      storedKeywordEntries: [{ value: 'calc', priority: 100 }]
    },
    reindex: {
      success: true,
      status: 'updated',
      path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
    },
    manualRegression: {
      reusableCaseIds: [
        'windows-app-scan-uwp',
        'windows-third-party-app-launch',
        'windows-shortcut-launch-args'
      ],
      suggestedEvidenceFields: {
        target: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        query: 'calc',
        launchKind: 'uwp',
        launchTarget: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        bundleOrIdentity: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe',
        displayNameStatus: 'clean',
        matchedStages: ['phrase', 'fts'],
        reindexStatus: 'updated'
      }
    },
    ...overrides
  }
}

describe('app-index-diagnostic-verifier', () => {
  it('passes strict Windows app index evidence gates', () => {
    const gate = evaluateAppIndexDiagnosticEvidence(buildEvidence(), {
      requireSuccess: true,
      requireQueryHit: true,
      requireLaunchKind: ['uwp'],
      requireLaunchTarget: true,
      requireBundleOrIdentity: true,
      requireCleanDisplayName: true,
      requireReindex: true,
      requireCaseIds: [
        'windows-app-scan-uwp',
        'windows-third-party-app-launch',
        'windows-shortcut-launch-args'
      ]
    })

    expect(gate).toEqual({
      passed: true,
      failures: [],
      warnings: []
    })
  })

  it('fails gates for weak or incomplete app index evidence', () => {
    const evidence = buildEvidence({
      diagnosis: {
        success: false,
        status: 'not-found',
        target: 'WeChat',
        reason: 'target-not-found',
        matchedStages: []
      },
      app: undefined,
      reindex: {
        success: false,
        status: 'not-found',
        reason: 'target-not-found'
      },
      manualRegression: {
        reusableCaseIds: ['windows-third-party-app-launch'],
        suggestedEvidenceFields: {
          target: 'WeChat',
          query: 'wechat',
          matchedStages: []
        }
      }
    })

    expect(
      evaluateAppIndexDiagnosticEvidence(evidence, {
        requireSuccess: true,
        requireQueryHit: true,
        requireLaunchKind: ['shortcut'],
        requireLaunchTarget: true,
        requireLaunchArgs: true,
        requireWorkingDirectory: true,
        requireBundleOrIdentity: true,
        requireCleanDisplayName: true,
        requireReindex: true,
        requireCaseIds: ['windows-app-scan-uwp']
      }).failures
    ).toEqual([
      'diagnostic target was not found: target-not-found',
      'diagnostic query did not hit the target app',
      'diagnostic launchKind mismatch: expected shortcut, got missing',
      'diagnostic launchTarget is missing',
      'diagnostic launchArgs are missing',
      'diagnostic workingDirectory is missing',
      'diagnostic bundleId/appIdentity is missing',
      'diagnostic displayName is not clean: missing',
      'diagnostic reindex did not succeed: not-found',
      'diagnostic reusable case ids missing: windows-app-scan-uwp'
    ])
  })

  it('keeps not-found diagnostics as warnings when success is not required', () => {
    const gate = evaluateAppIndexDiagnosticEvidence(
      buildEvidence({
        diagnosis: {
          success: false,
          status: 'not-found',
          target: 'Missing App',
          reason: 'target-not-found',
          matchedStages: []
        }
      })
    )

    expect(gate).toEqual({
      passed: true,
      failures: [],
      warnings: ['diagnostic target was not found: target-not-found']
    })
  })

  it('returns evidence with a recomputed gate', () => {
    const verified = verifyAppIndexDiagnosticEvidence(buildEvidence(), {
      requireSuccess: true,
      requireLaunchKind: ['uwp']
    })

    expect(verified.gate.passed).toBe(true)
    expect(verified.kind).toBe('app-index-diagnostic-evidence')
  })

  it('passes shortcut launch args and working directory gates', () => {
    const verified = verifyAppIndexDiagnosticEvidence(
      buildEvidence({
        app: {
          id: 7,
          path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Work Tool.lnk',
          name: 'Work Tool',
          displayName: 'Work Tool',
          rawDisplayName: 'Work Tool',
          displayNameStatus: 'clean',
          launchKind: 'shortcut',
          launchTarget: 'C:\\Program Files\\Work Tool\\tool.exe',
          launchArgs: '--profile default',
          workingDirectory: 'C:\\Program Files\\Work Tool',
          alternateNames: ['Work Tool'],
          entryEnabled: true
        }
      }),
      {
        requireLaunchKind: ['shortcut'],
        requireLaunchTarget: true,
        requireLaunchArgs: true,
        requireWorkingDirectory: true,
        requireCaseIds: ['windows-shortcut-launch-args']
      }
    )

    expect(verified.gate).toEqual({
      passed: true,
      failures: [],
      warnings: []
    })
  })

  it('passes clean displayName gate when a corrupted raw displayName used fallback', () => {
    const verified = verifyAppIndexDiagnosticEvidence(
      buildEvidence({
        app: {
          id: 9,
          path: 'D:\\Weixin\\Weixin.exe',
          name: 'WeChat',
          displayName: 'WeChat',
          rawDisplayName: '\u03A2\uFFFD\uFFFD',
          displayNameStatus: 'fallback',
          launchKind: 'path',
          launchTarget: 'D:\\Weixin\\Weixin.exe',
          alternateNames: ['微信'],
          entryEnabled: true
        },
        manualRegression: {
          reusableCaseIds: ['windows-third-party-app-launch'],
          suggestedEvidenceFields: {
            target: 'WeChat',
            query: 'wechat',
            launchKind: 'path',
            launchTarget: 'D:\\Weixin\\Weixin.exe',
            displayNameStatus: 'fallback',
            matchedStages: ['phrase']
          }
        }
      }),
      {
        requireCleanDisplayName: true,
        requireCaseIds: ['windows-third-party-app-launch']
      }
    )

    expect(verified.gate).toEqual({
      passed: true,
      failures: [],
      warnings: []
    })
  })

  it('fails clean displayName gate when diagnostic evidence lacks displayName status', () => {
    expect(
      evaluateAppIndexDiagnosticEvidence(
        buildEvidence({
          app: {
            id: 9,
            path: 'D:\\Weixin\\Weixin.exe',
            name: 'WeChat',
            displayName: '\u03A2\uFFFD\uFFFD',
            launchKind: 'path',
            launchTarget: 'D:\\Weixin\\Weixin.exe',
            alternateNames: [],
            entryEnabled: true
          }
        }),
        { requireCleanDisplayName: true }
      ).failures
    ).toEqual(['diagnostic displayName is not clean: missing'])
  })
})
