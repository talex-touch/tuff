import type {
  AppIndexDiagnoseResult,
  AppIndexReindexResult
} from '@talex-touch/utils/transport/events/types'
import { describe, expect, it } from 'vitest'
import {
  APP_INDEX_DIAGNOSTIC_REGRESSION_CASE_IDS,
  buildAppIndexDiagnosticEvidencePayload,
  formatAppIndexDiagnosticEvidenceJson
} from './app-index-diagnostic-evidence'

describe('app index diagnostic evidence', () => {
  it('builds a reusable payload for Windows app scan and launch regression records', () => {
    const diagnosis: AppIndexDiagnoseResult = {
      success: true,
      status: 'found',
      target: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      app: {
        id: 42,
        path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        name: 'Calculator',
        displayName: 'Calculator',
        rawDisplayName: 'Calculator',
        displayNameStatus: 'clean',
        fileName: 'Calculator.lnk',
        bundleId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe',
        appIdentity: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        launchKind: 'uwp',
        launchTarget: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        alternateNames: ['Calculator', 'Windows Calculator'],
        entrySource: 'windows-uwp',
        entryEnabled: true
      },
      index: {
        itemId: 'app:42',
        itemIds: ['app:42', 'app:uwp:calculator'],
        aliases: ['calculator'],
        generatedKeywords: ['calculator', 'windows calculator'],
        storedKeywords: ['calc'],
        storedKeywordEntries: [{ value: 'calc', priority: 100 }]
      },
      query: {
        raw: 'calc',
        normalized: 'calc',
        terms: ['calc'],
        ftsQuery: '"calc"*',
        candidateItemIds: ['app:42'],
        stages: {
          precise: {
            ran: true,
            targetHit: false,
            matches: []
          },
          phrase: {
            ran: true,
            targetHit: true,
            matches: [{ itemId: 'app:42', keyword: 'calc', priority: 100, score: 120 }]
          },
          prefix: {
            ran: true,
            targetHit: false,
            matches: []
          },
          fts: {
            ran: true,
            targetHit: true,
            matches: [{ itemId: 'app:42', keyword: 'calculator', score: 80 }]
          },
          ngram: {
            ran: false,
            targetHit: false,
            matches: [],
            reason: 'stage skipped after hit'
          },
          subsequence: {
            ran: false,
            targetHit: false,
            matches: [],
            reason: 'stage skipped after hit'
          }
        }
      }
    }
    const reindex: AppIndexReindexResult = {
      success: true,
      status: 'updated',
      path: diagnosis.app?.path,
      message: 'Single app reindexed'
    }

    const payload = buildAppIndexDiagnosticEvidencePayload({
      target: diagnosis.target,
      query: 'calc',
      diagnosis,
      reindex,
      createdAt: '2026-04-30T08:00:00.000Z'
    })

    expect(payload).toMatchObject({
      schemaVersion: 1,
      kind: 'app-index-diagnostic-evidence',
      createdAt: '2026-04-30T08:00:00.000Z',
      input: {
        target: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        query: 'calc'
      },
      diagnosis: {
        success: true,
        status: 'found',
        matchedStages: ['phrase', 'fts']
      },
      app: {
        displayName: 'Calculator',
        rawDisplayName: 'Calculator',
        displayNameStatus: 'clean',
        launchKind: 'uwp',
        launchTarget: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        appIdentity: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
      },
      index: {
        itemIds: ['app:42', 'app:uwp:calculator'],
        generatedKeywords: ['calculator', 'windows calculator'],
        storedKeywords: ['calc']
      },
      reindex: {
        success: true,
        status: 'updated',
        path: diagnosis.app?.path
      },
      manualRegression: {
        reusableCaseIds: APP_INDEX_DIAGNOSTIC_REGRESSION_CASE_IDS,
        suggestedEvidenceFields: {
          target: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
          query: 'calc',
          launchKind: 'uwp',
          launchTarget: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
          displayNameStatus: 'clean',
          matchedStages: ['phrase', 'fts'],
          reindexStatus: 'updated'
        }
      }
    })
    expect(payload.stages?.phrase?.matchCount).toBe(1)
    expect(payload.stages?.ngram).toEqual({
      ran: false,
      targetHit: false,
      reason: 'stage skipped after hit',
      matchCount: 0,
      matches: []
    })
    expect(formatAppIndexDiagnosticEvidenceJson(payload)).toContain(
      '"kind": "app-index-diagnostic-evidence"'
    )
  })

  it('preserves diagnostic failure status and reason for evidence export', () => {
    const diagnosis: AppIndexDiagnoseResult = {
      success: false,
      status: 'not-found',
      target: 'Missing App',
      reason: 'target-not-found'
    }

    const payload = buildAppIndexDiagnosticEvidencePayload({
      target: 'Missing App',
      query: 'missing',
      diagnosis,
      createdAt: '2026-05-10T08:00:00.000Z'
    })

    expect(payload).toMatchObject({
      kind: 'app-index-diagnostic-evidence',
      input: {
        target: 'Missing App',
        query: 'missing'
      },
      diagnosis: {
        success: false,
        status: 'not-found',
        target: 'Missing App',
        reason: 'target-not-found',
        matchedStages: []
      },
      manualRegression: {
        suggestedEvidenceFields: {
          target: 'Missing App',
          query: 'missing',
          matchedStages: []
        }
      }
    })
    expect(payload.app).toBeUndefined()
    expect(payload.index).toBeUndefined()
    expect(payload.stages).toBeUndefined()
    expect(formatAppIndexDiagnosticEvidenceJson(payload)).toContain('"reason": "target-not-found"')
  })

  it('keeps shortcut launch args and working directory in reusable evidence fields', () => {
    const diagnosis: AppIndexDiagnoseResult = {
      success: true,
      status: 'found',
      target: 'Work Tool',
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
    }

    const payload = buildAppIndexDiagnosticEvidencePayload({
      target: 'Work Tool',
      query: 'work',
      diagnosis,
      createdAt: '2026-05-10T10:00:00.000Z'
    })

    expect(payload.manualRegression).toMatchObject({
      reusableCaseIds: [
        'windows-app-scan-uwp',
        'windows-third-party-app-launch',
        'windows-shortcut-launch-args'
      ],
      suggestedEvidenceFields: {
        launchKind: 'shortcut',
        launchTarget: 'C:\\Program Files\\Work Tool\\tool.exe',
        launchArgs: '--profile default',
        workingDirectory: 'C:\\Program Files\\Work Tool',
        displayNameStatus: 'clean'
      }
    })
  })

  it('records displayName fallback status for corrupted Windows names', () => {
    const diagnosis: AppIndexDiagnoseResult = {
      success: true,
      status: 'found',
      target: 'WeChat',
      app: {
        id: 8,
        path: 'D:\\Weixin\\Weixin.exe',
        name: 'WeChat',
        displayName: 'WeChat',
        rawDisplayName: '\u03A2\uFFFD\uFFFD',
        displayNameStatus: 'fallback',
        launchKind: 'path',
        launchTarget: 'D:\\Weixin\\Weixin.exe',
        alternateNames: ['微信'],
        entryEnabled: true
      }
    }

    const payload = buildAppIndexDiagnosticEvidencePayload({
      target: 'WeChat',
      query: 'wechat',
      diagnosis,
      createdAt: '2026-05-10T10:00:00.000Z'
    })

    expect(payload.app).toMatchObject({
      displayName: 'WeChat',
      rawDisplayName: '\u03A2\uFFFD\uFFFD',
      displayNameStatus: 'fallback'
    })
    expect(payload.manualRegression.suggestedEvidenceFields).toMatchObject({
      displayNameStatus: 'fallback'
    })
  })
})
