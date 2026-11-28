import type { TuffItem } from '@talex-touch/utils'
import type { ContextSignal } from './context-provider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const intelligenceSdkMock = vi.hoisted(() => ({
  embeddingGenerate: vi.fn(),
  ragRerank: vi.fn()
}))

const clipboardLatest = vi.hoisted(() => ({ current: null as { content: string } | null }))

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd(),
    isPackaged: false
  },
  shell: { openExternal: vi.fn() }
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: () => ({
      isRegistered: () => false,
      register: vi.fn(),
      unregister: vi.fn(),
      start: vi.fn()
    })
  }
}))

vi.mock('../../../../service/app-task-gate', () => ({
  appTaskGate: {
    isActive: () => false,
    waitForIdle: vi.fn(async () => undefined)
  }
}))

vi.mock('../../../../db/db-write', () => ({
  scheduleAuxWrite: vi.fn(async () => undefined),
  scheduleDbWrite: vi.fn(async () => undefined)
}))

vi.mock('../../../sentry', () => ({
  getSentryService: () => ({
    isTelemetryEnabled: () => false,
    queueNexusTelemetry: vi.fn()
  })
}))

vi.mock('../../../storage', () => ({
  getMainConfig: vi.fn(() => ({})),
  isMainStorageReady: vi.fn(() => false)
}))

vi.mock('../../../ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    embedding: {
      generate: (...args: unknown[]) => intelligenceSdkMock.embeddingGenerate(...args)
    },
    rag: {
      rerank: (...args: unknown[]) => intelligenceSdkMock.ragRerank(...args)
    }
  }
}))

vi.mock('../../../clipboard', () => ({
  clipboardModule: {
    getLatestItem: () => clipboardLatest.current
  }
}))

import { registerFileRecommendationBridge } from '../../addon/files/file-recommendation-bridge'
import {
  registerBoxToolAiCapabilityPort,
  resetBoxToolAiCapabilityPort
} from '../../ports/ai-capability-port'
import {
  isBrowserApp,
  isDeveloperTool,
  isEntertainmentOrSocialApp,
  isFileManagerApp,
  isIDE,
  isImageApp,
  isJetBrainsIDE,
  isTerminalApp,
  isTextEditor,
  isVSCode
} from './app-category-rules'
import { collectNewlyAddedFileItems } from './recommendation-catalog-candidates'
import { hashContextContent } from './context-provider'
import { RecommendationEngine, type ScoredItem } from './recommendation-engine'
import {
  calculateContextualSemanticFileScore,
  CANDIDATE_EMBEDDING_CACHE_LIMIT,
  containsSensitiveSecret,
  recallContextualSemanticFiles,
  RecommendationSemanticScorer
} from './recommendation-semantic-scorer'
import { recommendationSourceRegistry } from './recommendation-source-registry'
import {
  buildPerfStats,
  buildPerfStatsByLayer,
  collectPerfSamples
} from './recommendation-telemetry-trend'
import { buildRecommendationSemanticProfile } from './semantic-profile'
import {
  calculateContextMatch,
  isSensitiveFilePath,
  matchClipboardContent,
  matchForegroundApp
} from './volatile-context-matcher'

const baseContext: ContextSignal = {
  time: {
    hourOfDay: 10,
    dayOfWeek: 2,
    isWorkingHours: true,
    timeSlot: 'morning'
  }
}

describe('recommendation modular refactor & dual-layer bridge', () => {
  let disposeBridge: (() => void) | null = null

  beforeEach(() => {
    registerBoxToolAiCapabilityPort({
      intelligence: {
        code: { review: vi.fn() },
        text: { summarize: vi.fn(), rewrite: vi.fn(), translate: vi.fn() },
        vision: { ocr: vi.fn(), caption: vi.fn() },
        embedding: {
          generate: (...args: unknown[]) => intelligenceSdkMock.embeddingGenerate(...args),
          generateLocalImage: vi.fn()
        },
        rag: {
          rerank: (...args: unknown[]) => intelligenceSdkMock.ragRerank(...args)
        }
      },
      normalizeIntelligenceError: (error, options) => ({
        code: 'UNKNOWN',
        message: String(error),
        reason: String(error),
        recovery: '',
        capabilityId: options?.capabilityId
      }),
      resolveCapabilityStatus: (capabilityId) => ({
        capabilityId,
        available: false,
        providerIds: []
      }),
      searchConversations: async () => [],
      isLocalEmbeddingReady: () => false,
      isLocalEmbeddingImageReady: () => false,
      getLocalEmbeddingModelKey: () => 'test-local-embedding-model',
      runWithEmbeddingPriority: (_priority, run) => run(),
      onUsageLimitsChanged: () => () => {},
      readUsageLimitInfo: () => null
    })
  })

  afterEach(() => {
    resetBoxToolAiCapabilityPort()
    disposeBridge?.()
    disposeBridge = null
    clipboardLatest.current = null
    intelligenceSdkMock.embeddingGenerate.mockReset()
    intelligenceSdkMock.ragRerank.mockReset()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('app-category-rules & volatile-context-matcher', () => {
    it('classifies app bundles and paths accurately', () => {
      expect(isBrowserApp('com.google.Chrome')).toBe(true)
      expect(isIDE('/Applications/Visual Studio Code.app')).toBe(true)
      expect(isVSCode('com.microsoft.VSCode')).toBe(true)
      expect(isJetBrainsIDE('com.jetbrains.pycharm', ['pycharm'])).toBe(true)
      expect(isTerminalApp('com.googlecode.iterm2')).toBe(true)
      expect(isImageApp('com.figma.Desktop')).toBe(true)
      expect(isTextEditor('/Applications/Typora.app')).toBe(true)
      expect(isFileManagerApp('com.apple.finder')).toBe(true)
      expect(isDeveloperTool('postman')).toBe(true)
      expect(isEntertainmentOrSocialApp('/Applications/微信.app')).toBe(true)
    })

    it('classifies all common cross-platform terminals without false-matching unrelated apps', () => {
      const terminalIdentities = [
        'com.apple.Terminal',
        'com.googlecode.iterm2',
        'com.mitchellh.ghostty',
        '/Applications/Ghostty.app',
        'dev.warp.Warp-Stable',
        '/Applications/Warp.app',
        'co.zeit.hyper',
        '/Applications/Hyper.app',
        'org.tabby',
        '/Applications/Tabby.app',
        'C:\\Users\\x\\AppData\\Local\\Programs\\Tabby\\Tabby.exe',
        'com.cmuxterm.app',
        '/Applications/cmux.app',
        'com.github.wez.wezterm',
        'C:\\Program Files\\WezTerm\\wezterm-gui.exe',
        'net.kovidgoyal.kitty',
        '/Applications/kitty.app',
        'org.alacritty',
        'C:\\Program Files\\Alacritty\\alacritty.exe',
        'com.raphaelamorim.rio',
        '/Applications/Rio.app',
        'dev.waveterm.waveterm',
        'dev.commandline.waveterm',
        '/Applications/WaveTerm.app',
        'kingtoolbox.windterm',
        '/Applications/WindTerm.app',
        'org.electerm.electerm',
        '/Applications/Electerm.app',
        'Microsoft.WindowsTerminal_8wekyb3d8bbwe',
        'C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe',
        'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        'C:\\Windows\\System32\\cmd.exe',
        'C:\\Program Files\\Git\\git-bash.exe',
        'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Git\\Git Bash.lnk'
      ]

      for (const id of terminalIdentities) {
        expect(isTerminalApp(id), `expected terminal: ${id}`).toBe(true)
        expect(isDeveloperTool(id), `expected developer tool: ${id}`).toBe(true)
      }

      const nonTerminals = [
        '/Applications/Cloudflare WARP.app',
        'com.cloudflare.1dot1dot1dot1.macos',
        'com.cloudflare.1dot1dot1dot1.macos Cloudflare WARP',
        '/Applications/Angry Birds Rio.app',
        '/Applications/Mario.app',
        '/Applications/Rio Studio.app',
        'com.example.rio',
        'com.example.rio Rio',
        '/Applications/Sound Wave.app',
        '/Applications/WaveLab.app',
        'com.waveapps.wave',
        'com.waveapps.wave Wave',
        '/Applications/HyperX NGENUITY.app',
        '/Applications/Hello Kitty.app',
        'com.sanrio.hellokitty',
        'C:\\Program Files\\Tool\\mycmd.exe',
        'C:\\Program Files\\Tool\\newt.exe'
      ]

      for (const id of nonTerminals) {
        expect(isTerminalApp(id), `expected non-terminal: ${id}`).toBe(false)
        expect(isDeveloperTool(id), `expected non-dev-tool: ${id}`).toBe(false)
      }
    })

    it('preserves app scores while adding file-extension/project affinity and suppressing sensitive files', () => {
      const tsClipboard = {
        type: 'text',
        contentType: 'code' as const,
        meta: {
          fileType: 'code' as const,
          language: 'typescript',
          fileExtension: 'ts',
          projectRoot: '/Users/x/Projects/tuff'
        }
      }

      expect(
        matchClipboardContent(
          { sourceId: 'app-provider', itemId: 'com.microsoft.VSCode', sourceType: 'app' },
          tsClipboard
        )
      ).toBe(100)

      const projectDocScore = matchClipboardContent(
        {
          sourceId: 'file-provider',
          itemId: '/Users/x/Projects/tuff/docs/architecture.md',
          sourceType: 'file'
        },
        tsClipboard
      )
      expect(projectDocScore).toBeGreaterThanOrEqual(70)
      expect(projectDocScore).toBeLessThanOrEqual(85)

      expect(
        matchClipboardContent(
          {
            sourceId: 'file-provider',
            itemId: '/Users/x/Projects/tuff/.env.production',
            sourceType: 'file'
          },
          tsClipboard
        )
      ).toBe(-100)

      expect(
        matchForegroundApp(
          {
            sourceId: 'file-provider',
            itemId: '/Users/x/Documents/Q4-report.pdf',
            sourceType: 'file'
          },
          { bundleId: 'com.tencent.xinWeChat', name: 'WeChat' }
        )
      ).toBeGreaterThan(0)

      expect(
        calculateContextMatch(
          {
            sourceId: 'file-provider',
            itemId: '/Users/x/.ssh/id_rsa',
            sourceType: 'file'
          },
          { ...baseContext, clipboard: { ...tsClipboard, content: 'hash', timestamp: Date.now() } }
        )
      ).toBeLessThan(0)
    })
  })

  describe('recommendation-telemetry-trend', () => {
    it('aggregates latency percentiles and per-cache-layer statistics', () => {
      const samples = collectPerfSamples([
        { metadata: JSON.stringify({ durationMs: 12, cacheLayer: 'memory' }) },
        { metadata: JSON.stringify({ durationMs: 28, cacheLayer: 'none' }) },
        { metadata: JSON.stringify({ durationMs: 64, cacheLayer: 'none' }) },
        { metadata: 'invalid-json' }
      ])

      expect(samples.cacheLayers).toMatchObject({ memory: 1, none: 2 })
      const allStats = buildPerfStats(samples.durations, 50)
      expect(allStats).toMatchObject({
        samples: 3,
        p50Ms: 28,
        maxMs: 64,
        overBudgetCount: 1
      })
      const byLayer = buildPerfStatsByLayer(samples.durationsByLayer, 50)
      expect(byLayer.memory?.samples).toBe(1)
      expect(byLayer.none?.overBudgetCount).toBe(1)
    })
  })

  describe('collectNewlyAddedFileItems dual-layer merge', () => {
    it('merges SQLite files and NativeFileArena listRecentFiles while gating sensitive and opened files', async () => {
      const now = Date.now()
      disposeBridge = registerFileRecommendationBridge({
        lookupFilesByPaths: async () => new Map(),
        listRecentFiles: async () => [
          {
            path: '/Users/x/Downloads/fresh-invoice.pdf',
            name: 'fresh-invoice.pdf',
            extension: '.pdf',
            size: 2048,
            mtime: new Date(now - 3_000),
            ctime: new Date(now - 3_000),
            isDir: false
          },
          {
            path: '/Users/x/Downloads/server.pem',
            name: 'server.pem',
            extension: '.pem',
            size: 512,
            mtime: new Date(now - 2_000),
            ctime: new Date(now - 2_000),
            isDir: false
          }
        ],
        recallSemanticFiles: async () => []
      })

      const dbUtils = {
        getRecentlyCreatedFiles: vi.fn(async () => [
          {
            path: '/Users/x/Documents/notes.md',
            size: 1024,
            isDir: false,
            ctime: new Date(now - 60_000)
          }
        ]),
        getUsageStatsBatch: vi.fn(async () => [])
      }

      const candidates = await collectNewlyAddedFileItems(dbUtils as never, 4, {
        debug: vi.fn(),
        warn: vi.fn()
      })

      expect(candidates.map((c) => c.itemId)).toEqual([
        '/Users/x/Downloads/fresh-invoice.pdf',
        '/Users/x/Documents/notes.md'
      ])
      expect(candidates[0]?.source).toBe('newly-added')
    })
  })

  describe('RecommendationSemanticScorer LRU & contextual Gemma recall', () => {
    it('caches candidate profile embeddings in a 256-entry LRU across recommendation passes', async () => {
      intelligenceSdkMock.embeddingGenerate.mockImplementation(
        async ({ text }: { text: string }) => ({
          result: text.includes('terminal') ? [1, 0] : [0.5, 0.5]
        })
      )

      const scorer = new RecommendationSemanticScorer({ debug: vi.fn() })
      const profile = buildRecommendationSemanticProfile(baseContext)
      const appNames = [
        'com.apple.Terminal',
        '/Applications/BravoTool.app',
        '/Applications/CharlieTool.app',
        '/Applications/DeltaTool.app',
        '/Applications/EchoTool.app',
        '/Applications/FoxtrotTool.app',
        '/Applications/GolfTool.app',
        '/Applications/HotelTool.app'
      ]
      const candidates: ScoredItem[] = appNames.map((itemId, idx) => ({
        sourceId: 'app-provider',
        itemId,
        sourceType: 'application',
        source: 'frequent',
        usageStats: {
          sourceId: 'app-provider',
          itemId,
          sourceType: 'application',
          searchCount: 0,
          executeCount: 5,
          cancelCount: 0,
          lastSearched: null,
          lastExecuted: null,
          lastCancelled: null,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        score: 10_000 - idx * 100
      }))

      const settings = {
        localVectorEnabled: true,
        aiEmbeddingEnabled: true,
        aiRerankEnabled: false
      }

      await scorer.applyAiEmbeddingScores(candidates, profile, settings)
      // First pass: 1 context embedding + 8 uncached candidate embeddings = 9 calls.
      expect(intelligenceSdkMock.embeddingGenerate).toHaveBeenCalledTimes(9)
      expect(scorer.candidateEmbeddingCacheSize).toBe(8)

      await scorer.applyAiEmbeddingScores(candidates, profile, settings)
      // Second pass: ONLY 1 context embedding call — all 8 candidate embeddings hit the LRU!
      expect(intelligenceSdkMock.embeddingGenerate).toHaveBeenCalledTimes(10)
      expect(CANDIDATE_EMBEDDING_CACHE_LIMIT).toBe(256)
    })

    it('scrubs secrets (sk-, ghp_, AKIA, .env, PEM, high-entropy passwords) and sensitive paths', async () => {
      expect(containsSensitiveSecret('sk-proj-1234567890abcdefghijklmnop')).toBe(true)
      expect(containsSensitiveSecret('ghp_1234567890abcdefghijklmnopqrstuvwx')).toBe(true)
      expect(containsSensitiveSecret('AKIAIOSFODNN7EXAMPLE')).toBe(true)
      expect(containsSensitiveSecret('OPENAI_API_KEY=xyz123\nDB_PASSWORD=topsecret')).toBe(true)
      expect(containsSensitiveSecret('-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK')).toBe(true)
      expect(containsSensitiveSecret('9x!Kp#2mQ$8vLw@5rZn7')).toBe(true)
      expect(containsSensitiveSecret('TypeError: Redis connection timeout on port 6379')).toBe(
        false
      )
      expect(containsSensitiveSecret('INV-2026-08912')).toBe(false)

      expect(isSensitiveFilePath('/Users/x/proj/.env')).toBe(true)
      expect(isSensitiveFilePath('/Users/x/proj/.env.local')).toBe(true)
      expect(isSensitiveFilePath('/Users/x/.ssh/id_rsa')).toBe(true)
      expect(isSensitiveFilePath('/Users/x/certs/client.pem')).toBe(true)
      expect(isSensitiveFilePath('/Users/x/certs/private.key')).toBe(true)
      expect(isSensitiveFilePath('/Users/x/Documents/redis-troubleshooting.md')).toBe(false)

      const recallSpy = vi.fn(async () => [
        { path: '/Users/x/Documents/should-not-run.md', score: 0.9 }
      ])
      const secretText = 'sk-ant-api03-secret-token-value-123456789'
      const hits = await recallContextualSemanticFiles(
        {
          ...baseContext,
          clipboard: {
            type: 'text',
            content: hashContextContent(secretText),
            timestamp: Date.now(),
            contentType: 'text'
          }
        },
        {
          getBridge: () => ({
            lookupFilesByPaths: async () => new Map(),
            listRecentFiles: async () => [],
            recallSemanticFiles: recallSpy
          }),
          readLatestClipboardText: async () => secretText
        }
      )

      expect(hits).toEqual([])
      expect(recallSpy).not.toHaveBeenCalled()
    })

    it('enforces the 120ms recall timeout and filters sensitive hit filenames', async () => {
      const cleanQuery = 'Redis connection timeout troubleshooting'
      const filteredHits = await recallContextualSemanticFiles(
        {
          ...baseContext,
          clipboard: {
            type: 'text',
            content: hashContextContent(cleanQuery),
            timestamp: Date.now(),
            contentType: 'text'
          }
        },
        {
          getBridge: () => ({
            lookupFilesByPaths: async () => new Map(),
            listRecentFiles: async () => [],
            recallSemanticFiles: async () => [
              { path: '/Users/x/proj/.env', score: 0.95 },
              { path: '/Users/x/.ssh/id_rsa', score: 0.93 },
              { path: '/Users/x/proj/node_modules/redis/README.md', score: 0.91 },
              { path: '/Users/x/Notes/redis-timeout-notes.md', score: 0.84 }
            ]
          }),
          readLatestClipboardText: async () => cleanQuery
        }
      )

      expect(filteredHits.map((h) => h.path)).toEqual(['/Users/x/Notes/redis-timeout-notes.md'])
      expect(calculateContextualSemanticFileScore(0.84)).toBeLessThan(95 * 1e4)

      let receivedSignal: AbortSignal | undefined
      const timedOutHits = await recallContextualSemanticFiles(
        {
          ...baseContext,
          clipboard: {
            type: 'text',
            content: hashContextContent(cleanQuery),
            timestamp: Date.now(),
            contentType: 'text'
          }
        },
        {
          timeoutMs: 15,
          getBridge: () => ({
            lookupFilesByPaths: async () => new Map(),
            listRecentFiles: async () => [],
            recallSemanticFiles: (_q, opts) => {
              receivedSignal = opts.signal
              return new Promise((resolve) =>
                setTimeout(() => resolve([{ path: '/Users/x/Notes/late.md', score: 0.9 }]), 200)
              )
            }
          }),
          readLatestClipboardText: async () => cleanQuery
        }
      )

      expect(timedOutHits).toEqual([])
      expect(receivedSignal?.aborted).toBe(true)
    })

    it('wires volatile Gemma contextual file recall into RecommendationEngine without polluting recommendation_cache', async () => {
      const errorStack = 'TypeError: Cannot read properties of undefined (reading "redisPool")'
      clipboardLatest.current = { content: errorStack }

      let cachedSnapshot: TuffItem[] = []
      const getFilesByType = vi.fn(async () => [])
      const dbUtils = {
        getDb: () => ({
          select: () => ({
            from: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => ({ all: async () => [], get: async () => null })
                }),
                groupBy: async () => [],
                limit: () => ({ get: async () => null })
              })
            })
          })
        }),
        getAuxDb: () => ({}),
        getAllPinnedItems: vi.fn(async () => []),
        getAllItemTimeStats: vi.fn(async () => []),
        getRecentlyCreatedFiles: vi.fn(async () => []),
        getRecommendationHistory: vi.fn(async () => []),
        getUsageStatsBatch: vi.fn(async () => []),
        getUsageBehaviorBatch: vi.fn(async () => []),
        getRecommendationCache: vi.fn(async () => null),
        setRecommendationCache: vi.fn(async (_key: string, items: TuffItem[]) => {
          cachedSnapshot = items
        }),
        getFilesByPaths: vi.fn(async () => []),
        getFileExtensionsByFileIds: vi.fn(async () => []),
        getFilesByType
      }

      disposeBridge = registerFileRecommendationBridge({
        lookupFilesByPaths: async () => new Map(),
        listRecentFiles: async () => [],
        recallSemanticFiles: async () => [
          { path: '/Users/x/Notes/redis-pool-incident.md', score: 0.88 }
        ]
      })

      const engine = new RecommendationEngine(dbUtils as never)
      // Override file-provider source rebuild in test so no disk stat is needed.
      recommendationSourceRegistry.unregister('file-provider')
      const disposeCustomFileSource = recommendationSourceRegistry.registerSource({
        sourceId: 'file-provider',
        aliases: ['file', 'files'],
        rebuild: async (ids) =>
          ids.map(
            (id) =>
              ({
                id,
                kind: 'file',
                source: { id: 'file-provider', type: 'file', name: 'File Provider' },
                render: { mode: 'default', basic: { title: 'redis-pool-incident.md' } }
              }) as TuffItem
          )
      })

      Object.assign(engine as unknown as Record<string, unknown>, {
        contextProvider: {
          getCurrentContext: vi.fn(async () => ({
            ...baseContext,
            clipboard: {
              type: 'text',
              content: hashContextContent(errorStack),
              timestamp: Date.now(),
              contentType: 'code',
              meta: { fileType: 'code', language: 'typescript' }
            }
          })),
          generateCacheKey: () => 'volatile-recall-key'
        },
        scheduleTrendBackfill: vi.fn()
      })

      try {
        const result = await engine.recommend({ limit: 5 })
        const fileItem = result.items.find(
          (item) => item.id === '/Users/x/Notes/redis-pool-incident.md'
        )
        expect(fileItem).toBeDefined()
        expect(fileItem?.meta?.recommendation?.source).toBe('context')
        expect(fileItem?.meta?.recommendation?.evidence).toBeUndefined()
        // Volatile contextual file MUST NOT be persisted inside recommendation_cache!
        expect(
          cachedSnapshot.some((item) => item.id === '/Users/x/Notes/redis-pool-incident.md')
        ).toBe(false)
        // Shared per-pass app catalog read: getFilesByType('app') called once in candidate pass
        expect(getFilesByType).toHaveBeenCalledTimes(1)
      } finally {
        disposeCustomFileSource()
        engine.stopBackgroundRefresh()
      }
    })
  })
})
