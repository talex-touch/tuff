import { describe, expect, it } from 'vitest'
import type { AppIndexDiagnosticEvidencePayload } from './app-index-diagnostic-verifier'
import {
  evaluateAppIndexDiagnosticEvidence,
  verifyAppIndexDiagnosticEvidence
} from './app-index-diagnostic-verifier'

function buildStages(
  itemId = 'app:42',
  matchedStages: AppIndexDiagnosticEvidencePayload['diagnosis']['matchedStages'] = ['phrase', 'fts']
): NonNullable<AppIndexDiagnosticEvidencePayload['stages']> {
  const matched = new Set(matchedStages)
  const buildStage = (
    stageKey: AppIndexDiagnosticEvidencePayload['diagnosis']['matchedStages'][number]
  ) => {
    const targetHit = matched.has(stageKey)
    const matches = targetHit
      ? [{ itemId, keyword: stageKey === 'fts' ? 'calculator' : 'calc' }]
      : []
    return {
      ran: true,
      targetHit,
      matchCount: matches.length,
      matches
    }
  }

  return {
    precise: buildStage('precise'),
    phrase: buildStage('phrase'),
    prefix: buildStage('prefix'),
    fts: buildStage('fts'),
    ngram: buildStage('ngram'),
    subsequence: buildStage('subsequence')
  }
}

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
      iconPresent: true,
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
    stages: buildStages(),
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
        iconPresent: true,
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
      requireIcon: true,
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
        target: 'ChatApp',
        reason: 'target-not-found',
        matchedStages: []
      },
      input: {
        target: 'ChatApp',
        query: 'chatapp'
      },
      app: undefined,
      index: undefined,
      stages: undefined,
      reindex: {
        success: false,
        status: 'not-found',
        reason: 'target-not-found'
      },
      manualRegression: {
        reusableCaseIds: ['windows-third-party-app-launch'],
        suggestedEvidenceFields: {
          target: 'ChatApp',
          query: 'chatapp',
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
        requireIcon: true,
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
      'diagnostic icon is missing',
      'diagnostic reindex did not succeed: not-found',
      'diagnostic reusable case ids missing: windows-app-scan-uwp'
    ])
  })

  it('keeps not-found diagnostics as warnings when success is not required', () => {
    const gate = evaluateAppIndexDiagnosticEvidence(
      buildEvidence({
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
        app: undefined,
        index: undefined,
        stages: undefined,
        reindex: undefined,
        manualRegression: {
          reusableCaseIds: [],
          suggestedEvidenceFields: {
            target: 'Missing App',
            query: 'missing',
            matchedStages: []
          }
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
        input: {
          target: 'Work Tool',
          query: 'work'
        },
        diagnosis: {
          success: true,
          status: 'found',
          target: 'Work Tool',
          matchedStages: ['precise']
        },
        app: {
          id: 7,
          path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Work Tool.lnk',
          name: 'Work Tool',
          displayName: 'Work Tool',
          rawDisplayName: 'Work Tool',
          displayNameStatus: 'clean',
          iconPresent: true,
          launchKind: 'shortcut',
          launchTarget: 'C:\\Program Files\\Work Tool\\tool.exe',
          launchArgs: '--profile default',
          workingDirectory: 'C:\\Program Files\\Work Tool',
          alternateNames: ['Work Tool'],
          entryEnabled: true
        },
        index: {
          itemId: 'app:7',
          itemIds: ['app:7'],
          aliases: ['work tool'],
          generatedKeywords: ['work tool'],
          storedKeywords: ['work'],
          storedKeywordEntries: [{ value: 'work', priority: 100 }]
        },
        stages: buildStages('app:7', ['precise']),
        reindex: {
          success: true,
          status: 'reindexed',
          path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Work Tool.lnk'
        },
        manualRegression: {
          reusableCaseIds: ['windows-shortcut-launch-args'],
          suggestedEvidenceFields: {
            target: 'Work Tool',
            query: 'work',
            launchKind: 'shortcut',
            launchTarget: 'C:\\Program Files\\Work Tool\\tool.exe',
            launchArgs: '--profile default',
            workingDirectory: 'C:\\Program Files\\Work Tool',
            displayNameStatus: 'clean',
            iconPresent: true,
            matchedStages: ['precise'],
            reindexStatus: 'reindexed'
          }
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
        input: {
          target: 'ChatApp',
          query: 'chatapp'
        },
        diagnosis: {
          success: true,
          status: 'found',
          target: 'ChatApp',
          matchedStages: ['phrase']
        },
        app: {
          id: 9,
          path: 'D:\\ChatApp\\ChatApp.exe',
          name: 'ChatApp',
          displayName: 'ChatApp',
          rawDisplayName: '\u03A2\uFFFD\uFFFD',
          displayNameStatus: 'fallback',
          iconPresent: true,
          launchKind: 'path',
          launchTarget: 'D:\\ChatApp\\ChatApp.exe',
          alternateNames: ['聊天应用'],
          entryEnabled: true
        },
        index: {
          itemId: 'app:9',
          itemIds: ['app:9'],
          aliases: ['chatapp'],
          generatedKeywords: ['chatapp'],
          storedKeywords: ['chatapp'],
          storedKeywordEntries: [{ value: 'chatapp', priority: 100 }]
        },
        stages: buildStages('app:9', ['phrase']),
        reindex: {
          success: true,
          status: 'updated',
          path: 'D:\\ChatApp\\ChatApp.exe'
        },
        manualRegression: {
          reusableCaseIds: ['windows-third-party-app-launch'],
          suggestedEvidenceFields: {
            target: 'ChatApp',
            query: 'chatapp',
            launchKind: 'path',
            launchTarget: 'D:\\ChatApp\\ChatApp.exe',
            displayNameStatus: 'fallback',
            iconPresent: true,
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
          input: {
            target: 'ChatApp',
            query: 'chatapp'
          },
          diagnosis: {
            success: true,
            status: 'found',
            target: 'ChatApp',
            matchedStages: ['phrase']
          },
          app: {
            id: 9,
            path: 'D:\\ChatApp\\ChatApp.exe',
            name: 'ChatApp',
            displayName: '\u03A2\uFFFD\uFFFD',
            iconPresent: true,
            launchKind: 'path',
            launchTarget: 'D:\\ChatApp\\ChatApp.exe',
            alternateNames: [],
            entryEnabled: true
          },
          index: {
            itemId: 'app:9',
            itemIds: ['app:9'],
            aliases: ['chatapp'],
            generatedKeywords: ['chatapp'],
            storedKeywords: ['chatapp'],
            storedKeywordEntries: [{ value: 'chatapp', priority: 100 }]
          },
          stages: buildStages('app:9', ['phrase']),
          reindex: {
            success: true,
            status: 'updated',
            path: 'D:\\ChatApp\\ChatApp.exe'
          },
          manualRegression: {
            reusableCaseIds: ['windows-third-party-app-launch'],
            suggestedEvidenceFields: {
              target: 'ChatApp',
              query: 'chatapp',
              launchKind: 'path',
              launchTarget: 'D:\\ChatApp\\ChatApp.exe',
              iconPresent: true,
              matchedStages: ['phrase'],
              reindexStatus: 'updated'
            }
          }
        }),
        { requireCleanDisplayName: true }
      ).failures
    ).toEqual(['diagnostic displayName is not clean: missing'])
  })

  it('fails icon gate when diagnostic evidence lacks indexed icon metadata', () => {
    expect(
      evaluateAppIndexDiagnosticEvidence(
        buildEvidence({
          input: {
            target: 'ChatApp',
            query: 'chatapp'
          },
          diagnosis: {
            success: true,
            status: 'found',
            target: 'ChatApp',
            matchedStages: ['phrase']
          },
          app: {
            id: 9,
            path: 'D:\\ChatApp\\ChatApp.exe',
            name: 'ChatApp',
            displayName: 'ChatApp',
            rawDisplayName: 'ChatApp',
            displayNameStatus: 'clean',
            iconPresent: false,
            launchKind: 'path',
            launchTarget: 'D:\\ChatApp\\ChatApp.exe',
            alternateNames: [],
            entryEnabled: true
          },
          index: {
            itemId: 'app:9',
            itemIds: ['app:9'],
            aliases: ['chatapp'],
            generatedKeywords: ['chatapp'],
            storedKeywords: ['chatapp'],
            storedKeywordEntries: [{ value: 'chatapp', priority: 100 }]
          },
          stages: buildStages('app:9', ['phrase']),
          reindex: {
            success: true,
            status: 'updated',
            path: 'D:\\ChatApp\\ChatApp.exe'
          },
          manualRegression: {
            reusableCaseIds: ['windows-third-party-app-launch'],
            suggestedEvidenceFields: {
              target: 'ChatApp',
              query: 'chatapp',
              launchKind: 'path',
              launchTarget: 'D:\\ChatApp\\ChatApp.exe',
              displayNameStatus: 'clean',
              iconPresent: false,
              matchedStages: ['phrase'],
              reindexStatus: 'updated'
            }
          }
        }),
        { requireIcon: true }
      ).failures
    ).toEqual(['diagnostic icon is missing'])
  })

  it('passes managed entry gate for copied app path diagnostic evidence', () => {
    const verified = verifyAppIndexDiagnosticEvidence(
      buildEvidence({
        input: {
          target: 'D:\\Tools\\CopiedTool.exe',
          query: 'copied'
        },
        diagnosis: {
          success: true,
          status: 'found',
          target: 'D:\\Tools\\CopiedTool.exe',
          matchedStages: ['phrase']
        },
        app: {
          id: 17,
          path: 'D:\\Tools\\CopiedTool.exe',
          name: 'CopiedTool.exe',
          displayName: 'CopiedTool',
          rawDisplayName: 'CopiedTool',
          displayNameStatus: 'clean',
          iconPresent: true,
          launchKind: 'path',
          launchTarget: 'D:\\Tools\\CopiedTool.exe',
          alternateNames: ['CopiedTool'],
          entrySource: 'manual',
          entryEnabled: true
        },
        index: {
          itemId: 'app:17',
          itemIds: ['app:17'],
          aliases: ['copiedtool'],
          generatedKeywords: ['copiedtool'],
          storedKeywords: ['copied'],
          storedKeywordEntries: [{ value: 'copied', priority: 100 }]
        },
        stages: buildStages('app:17', ['phrase']),
        reindex: {
          success: true,
          status: 'updated',
          path: 'D:\\Tools\\CopiedTool.exe'
        },
        manualRegression: {
          reusableCaseIds: ['windows-copied-app-path-index'],
          suggestedEvidenceFields: {
            target: 'D:\\Tools\\CopiedTool.exe',
            query: 'copied',
            launchKind: 'path',
            launchTarget: 'D:\\Tools\\CopiedTool.exe',
            displayNameStatus: 'clean',
            iconPresent: true,
            matchedStages: ['phrase'],
            reindexStatus: 'updated'
          }
        }
      }),
      {
        requireSuccess: true,
        requireQueryHit: true,
        requireLaunchKind: ['path'],
        requireLaunchTarget: true,
        requireManagedEntry: true,
        requireCaseIds: ['windows-copied-app-path-index']
      }
    )

    expect(verified.gate).toEqual({
      passed: true,
      failures: [],
      warnings: []
    })
  })

  it('fails managed entry gate when copied app path diagnostic is not a manual enabled entry', () => {
    expect(
      evaluateAppIndexDiagnosticEvidence(
        buildEvidence({
          input: {
            target: 'D:\\Tools\\CopiedTool.exe',
            query: 'copied'
          },
          diagnosis: {
            success: true,
            status: 'found',
            target: 'D:\\Tools\\CopiedTool.exe',
            matchedStages: ['phrase']
          },
          app: {
            id: 17,
            path: 'D:\\Tools\\CopiedTool.exe',
            name: 'CopiedTool.exe',
            displayName: 'CopiedTool',
            rawDisplayName: 'CopiedTool',
            displayNameStatus: 'clean',
            iconPresent: true,
            launchKind: 'path',
            launchTarget: 'D:\\Tools\\CopiedTool.exe',
            alternateNames: ['CopiedTool'],
            entrySource: 'scanned',
            entryEnabled: false
          },
          index: {
            itemId: 'app:17',
            itemIds: ['app:17'],
            aliases: ['copiedtool'],
            generatedKeywords: ['copiedtool'],
            storedKeywords: ['copied'],
            storedKeywordEntries: [{ value: 'copied', priority: 100 }]
          },
          stages: buildStages('app:17', ['phrase']),
          reindex: {
            success: true,
            status: 'updated',
            path: 'D:\\Tools\\CopiedTool.exe'
          },
          manualRegression: {
            reusableCaseIds: ['windows-copied-app-path-index'],
            suggestedEvidenceFields: {
              target: 'D:\\Tools\\CopiedTool.exe',
              query: 'copied',
              launchKind: 'path',
              launchTarget: 'D:\\Tools\\CopiedTool.exe',
              displayNameStatus: 'clean',
              iconPresent: true,
              matchedStages: ['phrase'],
              reindexStatus: 'updated'
            }
          }
        }),
        { requireManagedEntry: true }
      ).failures
    ).toEqual([
      'diagnostic managed entry source mismatch: expected manual, got scanned',
      'diagnostic managed entry is not enabled'
    ])
  })

  it('rejects successful reindex evidence that only matches the input name instead of the app entity', () => {
    expect(
      evaluateAppIndexDiagnosticEvidence(
        buildEvidence({
          input: {
            target: 'Calculator',
            query: 'calc'
          },
          diagnosis: {
            success: true,
            status: 'found',
            target: 'Calculator',
            matchedStages: ['phrase', 'fts']
          },
          reindex: {
            success: true,
            status: 'reindexed',
            path: 'Calculator'
          },
          manualRegression: {
            ...buildEvidence().manualRegression,
            suggestedEvidenceFields: {
              ...buildEvidence().manualRegression.suggestedEvidenceFields,
              target: 'Calculator',
              matchedStages: ['phrase', 'fts'],
              reindexStatus: 'reindexed'
            }
          }
        }),
        { requireReindex: true }
      ).failures
    ).toEqual(['diagnostic reindex path does not match target app'])
  })

  it('rejects query hit evidence when matched stages do not contain target matches', () => {
    expect(
      evaluateAppIndexDiagnosticEvidence(
        buildEvidence({
          stages: {
            ...buildStages(),
            phrase: {
              ran: true,
              targetHit: true,
              matchCount: 1,
              matches: [{ itemId: 'app:99', keyword: 'calc' }]
            },
            fts: {
              ran: true,
              targetHit: false,
              matchCount: 0,
              matches: []
            }
          }
        }),
        { requireQueryHit: true }
      ).failures
    ).toEqual([
      'diagnostic phrase target hit does not include the target item id',
      'diagnostic matchedStages do not match stage target hits: expected phrase, got phrase, fts'
    ])
  })

  it('rejects stage evidence with results from stages that did not run or did not hit target', () => {
    expect(
      evaluateAppIndexDiagnosticEvidence(
        buildEvidence({
          diagnosis: {
            ...buildEvidence().diagnosis,
            matchedStages: ['phrase', 'prefix', 'fts']
          },
          stages: {
            ...buildStages(),
            prefix: {
              ran: false,
              targetHit: true,
              matchCount: 1,
              matches: [{ itemId: 'app:42', keyword: 'calc' }]
            },
            ngram: {
              ran: true,
              targetHit: false,
              matchCount: 1,
              matches: [{ itemId: 'app:42', keyword: 'calc' }]
            }
          },
          manualRegression: {
            ...buildEvidence().manualRegression,
            suggestedEvidenceFields: {
              ...buildEvidence().manualRegression.suggestedEvidenceFields,
              matchedStages: ['phrase', 'prefix', 'fts']
            }
          }
        }),
        { requireQueryHit: true }
      ).failures
    ).toEqual([
      'diagnostic prefix has results without running',
      'diagnostic ngram has matches without target hit'
    ])
  })
})
