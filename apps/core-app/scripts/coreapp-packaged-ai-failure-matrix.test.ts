// @vitest-environment jsdom
import type { ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp, defineComponent, h, nextTick, reactive, type Component } from 'vue'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  FAILURE_BUILTIN_FEATURE_IDS,
  FAILURE_CALLER_ID,
  FAILURE_FEATURE_ID,
  FAILURE_MATRIX_SCHEMA,
  FAILURE_PROFILE_MARKER,
  FAILURE_PROFILE_PREFIX,
  FAILURE_PROFILE_SCHEMA,
  FAILURE_PROVIDER_ID,
  FAILURE_PROVIDER_MODEL,
  FAILURE_SEARCH_PROVIDER_ID,
  FAILURE_SCENARIOS,
  FAILURE_SCENARIO_CONTRACTS,
  FailureUiObservationError,
  FailureScenarioSupervisor,
  assessFailureScenario,
  buildCoreBoxInputMutationExpression,
  buildFailureFeatureCandidateClickExpression,
  buildFailureMatrixConfig,
  buildFailureMatrixLaunchEnv,
  buildFailureSearchObserverInstallExpression,
  buildFailureSearchResultObservationExpression,
  cleanupFailureMatrixProfile,
  enableFailurePlugin,
  enableFailureSearchProvider,
  failureFeatureCandidateSignature,
  failureLedgerMatchesContract,
  failureMatrixSignalExitCode,
  hashFailureMatrixArtifact,
  installFailureMatrixSignalHandlers,
  isFailureInteractionReady,
  isFailureMatrixProfileCleanupTarget,
  isFailureMatrixReportRedacted,
  isFailurePromptDispatched,
  isFailureWidgetReady,
  parseFailureMatrixArgs,
  prepareFailureWidgetWithDriver,
  prepareFailureMatrixProfile,
  projectFailureMatrixFailure,
  projectFailureUiEvidence,
  readFailureMatrixBundleVersion,
  selectFailureFeatureCandidate,
  startFailureFixture,
  submitFailurePromptWithDriver,
  summarizeFailureLedgerDelta,
  waitForExpectedFailureUi,
  type CallerLedgerSnapshot,
  type FailureMatrixMainEventSender,
  type FailureFeatureCandidate,
  type FailureFixtureEvidence,
  type FailureInteractionEvidence,
  type FailureSearchResultIdentity,
  type FailureSearchResultObservation,
  type FailureScenarioEvidence,
  type FailureScenarioName,
  type FailureMatrixSignalSource,
  type LaunchPaths,
  type PreparedProfile,
  type FailureUiPayload,
  type FailureWidgetReadiness
} from './coreapp-packaged-ai-failure-matrix'

const searchInputHarnessState = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: unknown) => unknown>(),
  registryReady: false,
  requestSequence: 0,
  requests: [] as Array<{ query: string; itemCount: number }>,
  send: vi.fn(async (_eventName: unknown, _payload?: unknown) => undefined)
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: (
      event: { toEventName?: () => string } | string,
      callback: (payload?: unknown) => unknown
    ) => {
      const eventName = typeof event === 'string' ? event : event.toEventName?.() || String(event)
      searchInputHarnessState.listeners.set(eventName, callback)
      return () => searchInputHarnessState.listeners.delete(eventName)
    },
    send: searchInputHarnessState.send,
    stream: async (
      event: { toEventName?: () => string } | string,
      payload: unknown,
      options: {
        onData: (payload: unknown) => void
        onError?: (error: unknown) => void
        onEnd?: () => void
      }
    ) => {
      const eventName = typeof event === 'string' ? event : event.toEventName?.() || String(event)
      const controller = { cancel: vi.fn(), cancelled: false, streamId: `mock-${eventName}` }
      if (eventName !== 'core-box:search:session') return controller

      const request = payload as { query?: { text?: unknown; inputs?: unknown[] } }
      const query = typeof request.query?.text === 'string' ? request.query.text : ''
      const requestNumber = ++searchInputHarnessState.requestSequence
      const sessionId = `input-session-${requestNumber}`
      const featureIds = [
        'intelligence-ask',
        'intelligence-rewrite',
        'intelligence-summarize',
        'intelligence-explain',
        'intelligence-command-registry'
      ]
      const items =
        query === 'ai' && searchInputHarnessState.registryReady
          ? featureIds.map((featureId) => ({
              id: `touch-intelligence/${featureId}`,
              kind: 'feature',
              source: { id: 'plugin-features', type: 'plugin' },
              render: { mode: 'default', basic: { title: featureId } },
              meta: { pluginName: 'touch-intelligence', featureId }
            }))
          : []
      searchInputHarnessState.requests.push({ query, itemCount: items.length })
      options.onData({ type: 'session', sessionId })
      options.onData({
        type: 'snapshot',
        sessionId,
        result: {
          sessionId,
          items,
          query: { text: query, inputs: request.query?.inputs ?? [] },
          duration: 1,
          sources: []
        }
      })
      options.onData({ type: 'complete', sessionId, sources: [] })
      options.onEnd?.()
      return controller
    }
  })
}))

vi.mock('~/modules/box/item-sdk', async () => {
  const { shallowRef } = await vi.importActual<typeof import('vue')>('vue')
  return { useBoxItems: () => ({ items: shallowRef([]) }) }
})

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: {
    coreBox: {},
    diagnostics: { verboseLogs: false },
    recommendation: { enabled: true },
    searchEngine: { logsEnabled: false },
    tools: { autoHide: true, autoPaste: { enable: false, time: 5 } }
  }
}))

vi.mock('~/utils/dev-log', () => ({ devLog: vi.fn() }))
vi.mock('~/modules/hooks/core-box', () => ({
  isDivisionBoxMode: () => false,
  windowState: { type: 'corebox', divisionBox: null }
}))
vi.mock('../src/renderer/src/modules/box/adapter/hooks/detached-division', () => ({
  isDetachedDivisionItemMatch: () => false,
  parseDetachedDivisionConfig: () => null
}))
vi.mock('../src/renderer/src/modules/box/adapter/transport/input-transport', () => ({
  createCoreBoxInputTransport: () => ({ broadcast: vi.fn() })
}))
vi.mock('../src/renderer/src/modules/box/adapter/hooks/app-launch-item', () => ({
  isBackgroundAppLaunchItem: () => false
}))
vi.mock('../src/renderer/src/modules/box/adapter/hooks/useResize', () => ({ useResize: vi.fn() }))
vi.mock('../src/renderer/src/modules/box/adapter/hooks/useClipboardChannel', () => ({
  getLatestClipboard: vi.fn(async () => null)
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

function mockMainEventSender(
  handler: (eventName: string, payload?: unknown) => unknown | Promise<unknown>
) {
  const mock = vi.fn(handler)
  const send: FailureMatrixMainEventSender = async <T>(
    eventName: string,
    payload?: unknown
  ): Promise<T> => (await mock(eventName, payload)) as T
  return { send, mock }
}

function ledgerSnapshot(
  values: {
    auditCount?: number
    auditSuccessCount?: number
    auditFailureCount?: number
    auditTotalTokens?: number
    auditTotalCost?: number
    dayRequestCount?: number
    daySuccessCount?: number
    dayFailureCount?: number
    dayTotalTokens?: number
    dayTotalCost?: number
    monthRequestCount?: number
    monthSuccessCount?: number
    monthFailureCount?: number
    monthTotalTokens?: number
    monthTotalCost?: number
  } = {}
): CallerLedgerSnapshot {
  return {
    auditCount: values.auditCount ?? 0,
    auditSuccessCount: values.auditSuccessCount ?? 0,
    auditFailureCount: values.auditFailureCount ?? 0,
    auditTotalTokens: values.auditTotalTokens ?? 0,
    auditTotalCost: values.auditTotalCost ?? 0,
    usage: {
      day: {
        requestCount: values.dayRequestCount ?? 0,
        successCount: values.daySuccessCount ?? 0,
        failureCount: values.dayFailureCount ?? 0,
        totalTokens: values.dayTotalTokens ?? 0,
        totalCost: values.dayTotalCost ?? 0
      },
      month: {
        requestCount: values.monthRequestCount ?? 0,
        successCount: values.monthSuccessCount ?? 0,
        failureCount: values.monthFailureCount ?? 0,
        totalTokens: values.monthTotalTokens ?? 0,
        totalCost: values.monthTotalCost ?? 0
      }
    }
  }
}

function expectedUi(scenario: FailureScenarioName): FailureUiPayload {
  const contract = FAILURE_SCENARIO_CONTRACTS[scenario]
  return {
    code: contract.errorCode,
    reason: 'stable reason canary',
    recovery: 'stable recovery canary',
    noticeVisible: true,
    busyCleared: true,
    retryVisible: true,
    intelligenceSettingsVisible: contract.settingsAction === 'intelligence',
    permissionSettingsVisible: contract.settingsAction === 'permission'
  }
}

function failureFeatureCandidate(
  overrides: Partial<FailureFeatureCandidate> = {}
): FailureFeatureCandidate {
  return {
    domIndex: 0,
    itemId: `touch-intelligence/${FAILURE_FEATURE_ID}`,
    sourceId: 'plugin-features',
    pluginName: 'touch-intelligence',
    featureId: FAILURE_FEATURE_ID,
    visible: true,
    ...overrides
  }
}

function failureWidgetReadiness(
  overrides: Partial<FailureWidgetReadiness> = {}
): FailureWidgetReadiness {
  return {
    pluginName: 'touch-intelligence',
    featureId: FAILURE_FEATURE_ID,
    hasAiChatbot: true,
    hasPromptSendButton: true,
    promptSendEnabled: true,
    promptMatchesFailurePrompt: false,
    updatedAt: 'baseline-1',
    inputValue: '',
    requestId: '',
    status: 'idle',
    ...overrides
  }
}

function failureBuiltinCandidates(): FailureFeatureCandidate[] {
  return FAILURE_BUILTIN_FEATURE_IDS.map((featureId, domIndex) =>
    failureFeatureCandidate({
      domIndex,
      itemId: `touch-intelligence/${featureId}`,
      featureId
    })
  )
}

function failureSearchResult(
  overrides: Partial<FailureSearchResultObservation> = {}
): FailureSearchResultObservation {
  return {
    query: 'ai',
    requestId: 'request-ai-1',
    sessionId: 'session-ai-1',
    resultRevision: 2,
    settled: true,
    candidates: failureBuiltinCandidates(),
    ...overrides
  }
}

function failureSearchBaseline(
  overrides: Partial<FailureSearchResultObservation> = {}
): FailureSearchResultObservation {
  return failureSearchResult({
    query: '',
    requestId: 'request-baseline',
    sessionId: 'session-baseline',
    resultRevision: 1,
    candidates: [],
    ...overrides
  })
}

interface FailureSearchInputHarnessHook {
  searchVal: { value: string }
  handleSearchImmediate(): Promise<void>
}

interface FailureSearchInputHarnessModules {
  useSearch: (boxOptions: unknown, clipboardOptions: unknown) => FailureSearchInputHarnessHook
  BoxInput: Component
}

let failureSearchInputHarnessModules: FailureSearchInputHarnessModules | null = null

beforeAll(async () => {
  const useSearchModulePath = '../src/renderer/src/modules/box/adapter/hooks/useSearch'
  const boxInputModulePath = '../src/renderer/src/views/box/BoxInput.vue'
  const [searchModule, inputModule] = await Promise.all([
    vi.importActual<{
      useSearch: (boxOptions: unknown, clipboardOptions: unknown) => FailureSearchInputHarnessHook
    }>(useSearchModulePath),
    vi.importActual<{ default: Component }>(boxInputModulePath)
  ])
  failureSearchInputHarnessModules = {
    useSearch: searchModule.useSearch,
    BoxInput: inputModule.default
  }
}, 30_000)

function mountFailureSearchInputHarness() {
  if (!failureSearchInputHarnessModules) throw new Error('Search input harness modules unavailable')
  const { useSearch, BoxInput } = failureSearchInputHarnessModules
  const root = document.createElement('div')
  document.body.appendChild(root)
  const boxOptions = reactive({
    lastHidden: -1,
    mode: 'input',
    focus: 0,
    file: { buffer: null, paths: [] },
    data: {},
    layout: undefined
  })
  const clipboardOptions = {
    last: null,
    pendingAutoFillItem: null,
    detectedAt: null,
    lastClearedTimestamp: null,
    activeClipboardSource: null,
    lastTextAttachmentIdentity: null,
    lastTextAttachmentSource: null
  }
  let search!: FailureSearchInputHarnessHook
  const app = createApp(
    defineComponent({
      setup() {
        search = useSearch(boxOptions, clipboardOptions)
        return () =>
          h(BoxInput, {
            boxOptions,
            modelValue: search.searchVal.value,
            'onUpdate:modelValue': (value: string) => {
              search.searchVal.value = value
            }
          })
      }
    })
  )
  app.mount(root)
  return {
    search,
    cleanup: () => {
      app.unmount()
      root.remove()
    }
  }
}

function emptyInteraction(): FailureInteractionEvidence {
  return {
    queryAccepted: false,
    candidateFeatureIds: [],
    selectedFeatureId: '',
    widgetFeatureId: '',
    promptAccepted: false,
    sendReady: false
  }
}

function expectedInteraction(
  overrides: Partial<FailureInteractionEvidence> = {}
): FailureInteractionEvidence {
  return {
    queryAccepted: true,
    candidateFeatureIds: [FAILURE_FEATURE_ID],
    selectedFeatureId: FAILURE_FEATURE_ID,
    widgetFeatureId: FAILURE_FEATURE_ID,
    promptAccepted: true,
    sendReady: true,
    ...overrides
  }
}

function fixtureEvidence(overrides: Partial<FailureFixtureEvidence> = {}): FailureFixtureEvidence {
  return {
    requests: 0,
    responseHeadersSent: false,
    partialDeltaSent: false,
    bodyHeldOpen: false,
    ...overrides
  }
}

function expectedLedgerDelta(scenario: FailureScenarioName) {
  const contract = FAILURE_SCENARIO_CONTRACTS[scenario]
  return summarizeFailureLedgerDelta(
    ledgerSnapshot(),
    ledgerSnapshot({
      auditCount: contract.auditDelta,
      auditFailureCount: contract.auditDelta,
      dayRequestCount: contract.usageRequestDelta,
      dayFailureCount: contract.usageRequestDelta,
      monthRequestCount: contract.usageRequestDelta,
      monthFailureCount: contract.usageRequestDelta
    })
  )
}

function launchPathsFixture(userDataDir: string): LaunchPaths {
  const root = path.join(userDataDir, 'failure-matrix')
  return {
    userDataDir,
    homeDir: path.join(root, 'home'),
    codexHome: path.join(root, 'codex-home'),
    tempDir: path.join(root, 'tmp'),
    fileProviderRoot: path.join(root, 'file-provider-root'),
    missingPiPath: path.join(root, 'missing-pi'),
    piAgentDir: path.join(root, 'pi-agent')
  }
}

function preparedProfileFixture(token = 'owned-test-token'): PreparedProfile {
  const userDataDir = path.join(tmpdir(), `${FAILURE_PROFILE_PREFIX}${token}-profile`)
  return {
    userDataDir,
    paths: launchPathsFixture(userDataDir),
    ownershipToken: token
  }
}

function redactedReportFixture(): Record<string, unknown> {
  return {
    schema: FAILURE_MATRIX_SCHEMA,
    ok: true,
    checkedAt: '2026-08-25T12:00:00.000Z',
    app: {
      version: '2.4.14-beta.14',
      hash: 'a'.repeat(64)
    },
    runtime: {
      appBundle: 'tuff.app',
      freshProfiles: FAILURE_SCENARIOS.length,
      cleanupRequested: true,
      cleanupComplete: true
    },
    scenarios: FAILURE_SCENARIOS.map((scenario): FailureScenarioEvidence => {
      const contract = FAILURE_SCENARIO_CONTRACTS[scenario]
      return {
        name: scenario,
        ok: true,
        profile: 'fresh-isolated',
        fixture: {
          ...contract.fixture,
          boundToLoopback: true,
          closed: true
        },
        ui: projectFailureUiEvidence(expectedUi(scenario)),
        ledger: expectedLedgerDelta(scenario),
        prerequisites: {
          requiredPermissionsGranted: true,
          searchProviderEnabled: true,
          pluginEnabled: true,
          intelligencePermissionRevoked: scenario === 'permission-denied',
          quotaDisabled: scenario === 'quota-exhausted'
        },
        interaction: expectedInteraction(),
        processStopped: true,
        profileRemoved: true,
        failures: []
      }
    }),
    failures: []
  }
}

describe('packaged AI failure matrix contracts', () => {
  it('pins the evidence schema and the ordered five-scenario matrix', () => {
    expect(FAILURE_MATRIX_SCHEMA).toBe('tuff.packaged-ai-failure-matrix.v2')
    expect(FAILURE_SCENARIOS).toEqual([
      'no-provider',
      'quota-exhausted',
      'unsupported-model',
      'permission-denied',
      'timeout'
    ])
    expect(Object.keys(FAILURE_SCENARIO_CONTRACTS)).toEqual(FAILURE_SCENARIOS)
    expect(FAILURE_CALLER_ID).toBe('plugin:touch-intelligence')
  })

  it('pins each failure code to its provider, audit, usage, and recovery contract', () => {
    expect(FAILURE_SCENARIO_CONTRACTS).toEqual({
      'no-provider': {
        name: 'no-provider',
        errorCode: 'PROVIDER_UNAVAILABLE',
        fixture: {
          requests: 0,
          responseHeadersSent: false,
          partialDeltaSent: false,
          bodyHeldOpen: false
        },
        auditDelta: 0,
        usageRequestDelta: 0,
        settingsAction: 'intelligence'
      },
      'quota-exhausted': {
        name: 'quota-exhausted',
        errorCode: 'QUOTA_EXHAUSTED',
        fixture: {
          requests: 0,
          responseHeadersSent: false,
          partialDeltaSent: false,
          bodyHeldOpen: false
        },
        auditDelta: 0,
        usageRequestDelta: 0,
        settingsAction: 'none'
      },
      'unsupported-model': {
        name: 'unsupported-model',
        errorCode: 'MODEL_UNSUPPORTED',
        fixture: {
          requests: 1,
          responseHeadersSent: true,
          partialDeltaSent: false,
          bodyHeldOpen: false
        },
        auditDelta: 1,
        usageRequestDelta: 1,
        settingsAction: 'none'
      },
      'permission-denied': {
        name: 'permission-denied',
        errorCode: 'PERMISSION_DENIED',
        fixture: {
          requests: 0,
          responseHeadersSent: false,
          partialDeltaSent: false,
          bodyHeldOpen: false
        },
        auditDelta: 0,
        usageRequestDelta: 0,
        settingsAction: 'permission'
      },
      timeout: {
        name: 'timeout',
        errorCode: 'NETWORK_FAILURE',
        fixture: {
          requests: 1,
          responseHeadersSent: true,
          partialDeltaSent: true,
          bodyHeldOpen: true
        },
        auditDelta: 1,
        usageRequestDelta: 1,
        settingsAction: 'intelligence'
      }
    })
  })

  it('selects only one visible Ask candidate with the full plugin feature identity', () => {
    const rewrite = failureFeatureCandidate({
      domIndex: 0,
      itemId: 'touch-intelligence/intelligence-rewrite',
      featureId: 'intelligence-rewrite'
    })
    const hiddenAsk = failureFeatureCandidate({ domIndex: 1, visible: false })
    const ask = failureFeatureCandidate({ domIndex: 2 })

    expect(selectFailureFeatureCandidate([rewrite, hiddenAsk, ask])).toEqual(ask)
    expect(selectFailureFeatureCandidate([rewrite])).toBeNull()
    expect(selectFailureFeatureCandidate([hiddenAsk])).toBeNull()
    expect(
      selectFailureFeatureCandidate([ask, failureFeatureCandidate({ domIndex: 3 })])
    ).toBeNull()
  })

  it('accepts only the complete stable five-feature candidate snapshot', () => {
    const candidates = failureBuiltinCandidates()
    const signature = failureFeatureCandidateSignature(candidates)

    expect(signature).not.toBeNull()
    expect(failureFeatureCandidateSignature(candidates.slice(0, -1))).toBeNull()
    expect(
      failureFeatureCandidateSignature(
        candidates.map((candidate, index) =>
          index === 1 ? { ...candidate, visible: false } : candidate
        )
      )
    ).toBeNull()
    expect(
      failureFeatureCandidateSignature([...candidates, { ...candidates[0], domIndex: 99 }])
    ).toBeNull()
    expect(
      failureFeatureCandidateSignature(
        candidates.map((candidate) =>
          candidate.featureId === FAILURE_FEATURE_ID
            ? { ...candidate, domIndex: candidate.domIndex + 10 }
            : candidate
        )
      )
    ).not.toBe(signature)
  })

  it('requires the mounted Ask widget identity in addition to shared AI controls', () => {
    expect(isFailureWidgetReady(failureWidgetReadiness())).toBe(true)
    expect(isFailureWidgetReady(failureWidgetReadiness({ pluginName: 'other-plugin' }))).toBe(false)
    expect(
      isFailureWidgetReady(failureWidgetReadiness({ featureId: 'intelligence-rewrite' }))
    ).toBe(false)
    expect(isFailureWidgetReady(failureWidgetReadiness({ hasAiChatbot: false }))).toBe(false)
    expect(isFailureWidgetReady(failureWidgetReadiness({ hasPromptSendButton: false }))).toBe(false)
    expect(isFailureWidgetReady(failureWidgetReadiness({ promptSendEnabled: false }))).toBe(false)
    expect(isFailureWidgetReady(null)).toBe(false)
  })

  it('drives BoxInput through Vue useSearch and preserves the duplicate-query guard', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T20:00:00.000Z'))
    searchInputHarnessState.listeners.clear()
    searchInputHarnessState.registryReady = false
    searchInputHarnessState.requestSequence = 0
    searchInputHarnessState.requests.length = 0
    searchInputHarnessState.send.mockClear()
    const harness = await mountFailureSearchInputHarness()
    const flush = async (ms: number) => {
      await nextTick()
      await vi.advanceTimersByTimeAsync(ms)
      await Promise.resolve()
      await nextTick()
    }

    try {
      await flush(100)
      searchInputHarnessState.requests.length = 0
      const input = document.querySelector('input#core-box-input')
      expect(input).toBeInstanceOf(HTMLInputElement)
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      expect(setter).toBeTypeOf('function')
      setter?.call(input, 'ai')
      await flush(100)
      expect(searchInputHarnessState.requests).toEqual([])

      expect(window.eval(buildCoreBoxInputMutationExpression('ai'))).toBe(true)
      await flush(80)
      expect(searchInputHarnessState.requests).toEqual([{ query: 'ai', itemCount: 0 }])

      await harness.search.handleSearchImmediate()
      expect(searchInputHarnessState.requests).toHaveLength(1)

      searchInputHarnessState.registryReady = true
      await flush(4_000)
      expect(window.eval(buildCoreBoxInputMutationExpression(''))).toBe(true)
      await flush(0)
      await flush(100)
      expect(window.eval(buildCoreBoxInputMutationExpression('ai'))).toBe(true)
      await flush(80)

      expect(searchInputHarnessState.requests.map(({ query }) => query)).toEqual(['ai', '', 'ai'])
      expect(searchInputHarnessState.requests[2].itemCount).toBe(FAILURE_BUILTIN_FEATURE_IDS.length)
    } finally {
      harness.cleanup()
      document.body.replaceChildren()
      vi.useRealTimers()
    }
  })

  it('observes channel search results atomically and rejects stale identities at click time', async () => {
    const channelListeners = new Map<string, (payload: unknown) => unknown>()
    const channel = {
      send: vi.fn(async (_eventName: string, _payload?: unknown) => undefined),
      regChannel(eventName: string, callback: (payload: unknown) => unknown) {
        channelListeners.set(eventName, callback)
        return () => channelListeners.delete(eventName)
      }
    }
    const testWindow = window as typeof window & Record<string, unknown>
    const previousTouchChannel = Object.getOwnPropertyDescriptor(window, 'touchChannel')
    Object.defineProperty(window, 'touchChannel', {
      configurable: true,
      writable: true,
      value: channel
    })

    const appRoot = document.createElement('div') as HTMLDivElement & {
      _vnode?: unknown
    }
    appRoot.id = 'app'
    document.body.appendChild(appRoot)
    const items = FAILURE_BUILTIN_FEATURE_IDS.map((featureId) => ({
      id: `touch-intelligence/${featureId}`,
      source: { id: 'plugin-features' },
      meta: { pluginName: 'touch-intelligence', featureId }
    }))
    const clickAsk = vi.fn()
    const childVnodes = items.map((item) => {
      const node = document.createElement('div')
      node.className = 'BoxGridItem'
      node.getBoundingClientRect = () =>
        ({ width: 120, height: 32, top: 0, right: 120, bottom: 32, left: 0 }) as DOMRect
      if (item.meta.featureId === FAILURE_FEATURE_ID) node.addEventListener('click', clickAsk)
      appRoot.appendChild(node)
      return {
        component: {
          vnode: { el: node },
          props: { item },
          subTree: null
        }
      }
    })
    appRoot._vnode = {
      component: {
        vnode: { el: appRoot },
        subTree: { children: childVnodes }
      }
    }

    const searchEvent = 'core-box:search:session'
    const registerStream = (requestId: string) => {
      const eventName = `${searchEvent}:stream:data:${requestId}`
      const callback = vi.fn(() => 'original-result')
      channel.regChannel(eventName, callback)
      return {
        callback,
        emit: (chunk: unknown) =>
          channelListeners.get(eventName)?.({ data: { chunk }, header: { status: 'request' } })
      }
    }
    const startStream = async (requestId: string, query: string) => {
      await channel.send(`${searchEvent}:stream:start`, {
        streamId: requestId,
        query: { text: query, inputs: [] }
      })
    }

    try {
      expect(window.eval(buildFailureSearchObserverInstallExpression())).toBe(true)
      const first = registerStream('request-1')
      await startStream('request-1', 'ai')
      expect(first.emit({ type: 'session', sessionId: 'session-1' })).toBe('original-result')
      first.emit({
        type: 'snapshot',
        sessionId: 'session-1',
        result: {
          sessionId: 'session-1',
          query: { text: 'ai', inputs: [] },
          items
        }
      })
      first.emit({ type: 'complete', sessionId: 'session-1' })

      const observation = window.eval(
        buildFailureSearchResultObservationExpression()
      ) as FailureSearchResultObservation
      expect(observation).toMatchObject({
        query: 'ai',
        requestId: 'request-1',
        sessionId: 'session-1',
        settled: true
      })
      expect(observation.candidates.map(({ featureId }) => featureId)).toEqual(
        FAILURE_BUILTIN_FEATURE_IDS
      )
      const ask = observation.candidates.find(({ featureId }) => featureId === FAILURE_FEATURE_ID)!
      const firstIdentity = {
        requestId: observation.requestId,
        sessionId: observation.sessionId,
        resultRevision: observation.resultRevision
      }
      expect(window.eval(buildFailureFeatureCandidateClickExpression(ask, firstIdentity))).toBe(
        true
      )
      expect(clickAsk).toHaveBeenCalledTimes(1)

      first.emit({ type: 'update', sessionId: 'session-1', items })
      expect(window.eval(buildFailureSearchResultObservationExpression())).toMatchObject({
        requestId: 'request-1',
        settled: false,
        candidates: []
      })
      expect(window.eval(buildFailureFeatureCandidateClickExpression(ask, firstIdentity))).toBe(
        false
      )

      const second = registerStream('request-2')
      await startStream('request-2', '')
      expect(window.eval(buildFailureSearchResultObservationExpression())).toMatchObject({
        requestId: 'request-2',
        sessionId: '',
        settled: false,
        candidates: []
      })
      first.emit({ type: 'update', sessionId: 'session-1', items })
      second.emit({ type: 'session', sessionId: 'session-2' })
      second.emit({
        type: 'snapshot',
        sessionId: 'session-2',
        result: {
          sessionId: 'session-2',
          query: { text: '', inputs: [] },
          items: []
        }
      })
      second.emit({ type: 'complete', sessionId: 'session-2' })

      expect(window.eval(buildFailureSearchResultObservationExpression())).toMatchObject({
        query: '',
        requestId: 'request-2',
        settled: true,
        candidates: []
      })
      expect(window.eval(buildFailureFeatureCandidateClickExpression(ask, firstIdentity))).toBe(
        false
      )
      expect(clickAsk).toHaveBeenCalledTimes(1)
      expect(first.callback).toHaveBeenCalledTimes(5)
    } finally {
      delete testWindow.__tuffPackagedAiFailureSearchObserverV1
      if (previousTouchChannel) {
        Object.defineProperty(window, 'touchChannel', previousTouchChannel)
      } else {
        delete testWindow.touchChannel
      }
      document.body.replaceChildren()
    }
  })

  it('clicks once only after consecutive candidate and widget readiness samples', async () => {
    let now = 0
    let searchResult = failureSearchBaseline()
    let activationStartedAt: number | null = null
    let readinessReadsAfterActivation = 0
    const candidates = failureBuiltinCandidates()
    const clickCandidate = vi.fn(
      async (candidate: FailureFeatureCandidate, identity: FailureSearchResultIdentity) => {
        expect(identity).toEqual({
          requestId: 'request-ai-1',
          sessionId: 'session-ai-1',
          resultRevision: 2
        })
        expect(candidate.featureId).toBe(FAILURE_FEATURE_ID)
        activationStartedAt = now
        return true
      }
    )
    const interaction = emptyInteraction()

    await prepareFailureWidgetWithDriver(
      {
        bringToFront: async () => undefined,
        setInput: async (value) => {
          if (value === 'ai') searchResult = failureSearchResult()
          return true
        },
        readSearchResult: async () => ({
          ...searchResult,
          candidates: now < 750 ? candidates.slice(0, -1) : candidates
        }),
        clickCandidate,
        readReadiness: async () => {
          if (activationStartedAt === null) return null
          readinessReadsAfterActivation += 1
          if (readinessReadsAfterActivation === 2) return null
          return failureWidgetReadiness()
        },
        now: () => now,
        wait: async (ms) => {
          now += ms
        }
      },
      interaction
    )

    expect(clickCandidate).toHaveBeenCalledTimes(1)
    expect(readinessReadsAfterActivation).toBe(4)
    expect(interaction.queryAccepted).toBe(true)
    expect(interaction.candidateFeatureIds).toEqual(FAILURE_BUILTIN_FEATURE_IDS)
    expect(interaction.selectedFeatureId).toBe(FAILURE_FEATURE_ID)
    expect(interaction.widgetFeatureId).toBe(FAILURE_FEATURE_ID)
    expect(activationStartedAt).not.toBeNull()
    expect(now - (activationStartedAt ?? now)).toBeGreaterThan(750)
  })

  it('never clicks again when the clicked activation does not become ready', async () => {
    let now = 0
    let searchResult = failureSearchBaseline()
    const candidates = failureBuiltinCandidates()
    const interaction = emptyInteraction()
    const clickCandidate = vi.fn(async () => true)

    await expect(
      prepareFailureWidgetWithDriver(
        {
          bringToFront: async () => undefined,
          setInput: async (value) => {
            if (value === 'ai') searchResult = failureSearchResult({ candidates })
            return true
          },
          readSearchResult: async () => searchResult,
          clickCandidate,
          readReadiness: async () => null,
          now: () => now,
          wait: async (ms) => {
            now += ms
          }
        },
        interaction
      )
    ).rejects.toMatchObject({ code: 'INTELLIGENCE_WIDGET_NOT_READY' })

    expect(clickCandidate).toHaveBeenCalledTimes(1)
  })

  it('refreshes a stale search query without retrying feature activation', async () => {
    let now = 0
    let searchResult = failureSearchBaseline()
    let activationTriggered = false
    let requestRevision = 1
    const candidates = failureBuiltinCandidates()
    const inputWrites: Array<{ value: string; at: number }> = []
    const setInput = vi.fn(async (value: string) => {
      inputWrites.push({ value, at: now })
      requestRevision += 1
      const requestNumber = inputWrites.length
      searchResult = failureSearchResult({
        query: value,
        requestId: `request-${requestNumber}`,
        sessionId: `session-${requestNumber}`,
        resultRevision: requestRevision,
        candidates: requestNumber === 3 && value === 'ai' ? candidates : []
      })
      return true
    })
    const clickCandidate = vi.fn(
      async (_candidate: FailureFeatureCandidate, identity: FailureSearchResultIdentity) => {
        expect(identity).toEqual({
          requestId: 'request-3',
          sessionId: 'session-3',
          resultRevision: 4
        })
        activationTriggered = true
        return true
      }
    )
    const interaction = emptyInteraction()

    await prepareFailureWidgetWithDriver(
      {
        bringToFront: async () => undefined,
        setInput,
        readSearchResult: async () => searchResult,
        clickCandidate,
        readReadiness: async () => (activationTriggered ? failureWidgetReadiness() : null),
        now: () => now,
        wait: async (ms) => {
          now += ms
        }
      },
      interaction
    )

    expect(inputWrites.map(({ value }) => value)).toEqual(['ai', '', 'ai'])
    expect(inputWrites[1].at - inputWrites[0].at).toBeGreaterThanOrEqual(4_000)
    expect(inputWrites[2].at - inputWrites[1].at).toBeGreaterThanOrEqual(100)
    expect(clickCandidate).toHaveBeenCalledTimes(1)
    expect(interaction.queryAccepted).toBe(true)
    expect(interaction.candidateFeatureIds).toEqual(FAILURE_BUILTIN_FEATURE_IDS)
    expect(interaction.selectedFeatureId).toBe(FAILURE_FEATURE_ID)
    expect(interaction.widgetFeatureId).toBe(FAILURE_FEATURE_ID)
  })

  it('refreshes when the first query never produces an accepted search observation', async () => {
    let now = 0
    let searchResult = failureSearchBaseline()
    let activationTriggered = false
    const candidates = failureBuiltinCandidates()
    const inputWrites: Array<{ value: string; at: number }> = []
    const setInput = vi.fn(async (value: string) => {
      inputWrites.push({ value, at: now })
      if (inputWrites.length === 3 && value === 'ai') {
        searchResult = failureSearchResult({
          requestId: 'request-recovered',
          sessionId: 'session-recovered',
          resultRevision: 2,
          candidates
        })
      }
      return true
    })
    const clickCandidate = vi.fn(
      async (_candidate: FailureFeatureCandidate, identity: FailureSearchResultIdentity) => {
        expect(identity).toEqual({
          requestId: 'request-recovered',
          sessionId: 'session-recovered',
          resultRevision: 2
        })
        activationTriggered = true
        return true
      }
    )
    const interaction = emptyInteraction()

    await prepareFailureWidgetWithDriver(
      {
        bringToFront: async () => undefined,
        setInput,
        readSearchResult: async () => searchResult,
        clickCandidate,
        readReadiness: async () => (activationTriggered ? failureWidgetReadiness() : null),
        now: () => now,
        wait: async (ms) => {
          now += ms
        }
      },
      interaction
    )

    expect(inputWrites.map(({ value }) => value).slice(0, 3)).toEqual(['ai', '', 'ai'])
    expect(inputWrites[1].at - inputWrites[0].at).toBeGreaterThanOrEqual(4_000)
    expect(clickCandidate).toHaveBeenCalledTimes(1)
    expect(interaction.queryAccepted).toBe(true)
    expect(interaction.selectedFeatureId).toBe(FAILURE_FEATURE_ID)
  })

  it('does not accumulate stable candidate samples across search identities', async () => {
    let now = 0
    let activationStartedAt: number | null = null
    let inputWritten = false
    const baseline = failureSearchBaseline()
    const firstResult = failureSearchResult()
    const secondResult = failureSearchResult({
      requestId: 'request-ai-2',
      sessionId: 'session-ai-2',
      resultRevision: 3
    })
    const clickCandidate = vi.fn(
      async (_candidate: FailureFeatureCandidate, identity: FailureSearchResultIdentity) => {
        expect(identity.requestId).toBe('request-ai-2')
        activationStartedAt = now
        return true
      }
    )

    await prepareFailureWidgetWithDriver(
      {
        bringToFront: async () => undefined,
        setInput: async () => {
          inputWritten = true
          return true
        },
        readSearchResult: async () => {
          if (!inputWritten) return baseline
          return now < 200 ? firstResult : secondResult
        },
        clickCandidate,
        readReadiness: async () => (activationStartedAt === null ? null : failureWidgetReadiness()),
        now: () => now,
        wait: async (ms) => {
          now += ms
        }
      },
      emptyInteraction()
    )

    expect(clickCandidate).toHaveBeenCalledTimes(1)
    expect(activationStartedAt).toBeGreaterThanOrEqual(1_600)
  })

  it('restarts candidate stability when identity changes during click validation', async () => {
    let now = 0
    let searchResult = failureSearchBaseline()
    let activationTriggered = false
    const clickIdentities: FailureSearchResultIdentity[] = []
    const clickCandidate = vi.fn(
      async (_candidate: FailureFeatureCandidate, identity: FailureSearchResultIdentity) => {
        clickIdentities.push(identity)
        if (clickIdentities.length === 1) {
          searchResult = failureSearchResult({
            requestId: 'request-ai-2',
            sessionId: 'session-ai-2',
            resultRevision: 3
          })
          return false
        }
        activationTriggered = true
        return true
      }
    )

    await prepareFailureWidgetWithDriver(
      {
        bringToFront: async () => undefined,
        setInput: async () => {
          searchResult = failureSearchResult()
          return true
        },
        readSearchResult: async () => searchResult,
        clickCandidate,
        readReadiness: async () => (activationTriggered ? failureWidgetReadiness() : null),
        now: () => now,
        wait: async (ms) => {
          now += ms
        }
      },
      emptyInteraction()
    )

    expect(clickCandidate).toHaveBeenCalledTimes(2)
    expect(clickIdentities.map(({ requestId }) => requestId)).toEqual([
      'request-ai-1',
      'request-ai-2'
    ])
  })

  it('requires a new pending request or an error transition after prompt click', async () => {
    const baseline = failureWidgetReadiness()
    expect(
      isFailurePromptDispatched(
        baseline,
        failureWidgetReadiness({
          promptMatchesFailurePrompt: true,
          requestId: 'request-1',
          status: 'chat-pending'
        })
      )
    ).toBe(true)
    expect(
      isFailurePromptDispatched(
        baseline,
        failureWidgetReadiness({ promptMatchesFailurePrompt: true, status: 'chat-pending' })
      )
    ).toBe(false)
    expect(
      isFailurePromptDispatched(
        baseline,
        failureWidgetReadiness({ promptMatchesFailurePrompt: true, status: 'error' })
      )
    ).toBe(true)
    expect(
      isFailurePromptDispatched(
        baseline,
        failureWidgetReadiness({ requestId: 'request-1', status: 'chat-pending' })
      )
    ).toBe(false)
    expect(
      isFailurePromptDispatched(
        failureWidgetReadiness({ promptMatchesFailurePrompt: true, status: 'error' }),
        failureWidgetReadiness({ promptMatchesFailurePrompt: true, status: 'error' })
      )
    ).toBe(false)
    expect(
      isFailurePromptDispatched(
        failureWidgetReadiness({ promptMatchesFailurePrompt: true, status: 'error' }),
        failureWidgetReadiness({
          promptMatchesFailurePrompt: true,
          status: 'error',
          updatedAt: 'permission-error-2'
        })
      )
    ).toBe(true)

    let now = 0
    let inputValue = ''
    const clickSendButton = vi.fn(async () => true)
    const interaction = emptyInteraction()
    await expect(
      submitFailurePromptWithDriver(
        {
          setInput: async (value) => {
            inputValue = value
            return true
          },
          readReadiness: async () => failureWidgetReadiness({ inputValue }),
          clickSendButton,
          now: () => now,
          wait: async (ms) => {
            now += ms
          }
        },
        interaction
      )
    ).rejects.toMatchObject({ code: 'FAILURE_PROMPT_NOT_DISPATCHED' })
    expect(clickSendButton).toHaveBeenCalledTimes(1)
    expect(interaction.promptAccepted).toBe(true)
    expect(interaction.sendReady).toBe(false)
  })

  it('preserves the last real UI payload when the expected failure times out', async () => {
    let now = 0
    const lastPayload: FailureUiPayload = {
      ...expectedUi('quota-exhausted'),
      code: 'PROVIDER_UNAVAILABLE',
      busyCleared: false
    }

    let failure: unknown
    try {
      await waitForExpectedFailureUi(
        async () => lastPayload,
        'QUOTA_EXHAUSTED',
        400,
        () => undefined,
        {
          now: () => now,
          wait: async (ms) => {
            now += ms
          }
        }
      )
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(FailureUiObservationError)
    expect((failure as FailureUiObservationError).lastPayload).toEqual(lastPayload)
    expect(projectFailureMatrixFailure(failure, 'scenario:quota-exhausted:ui')).toEqual({
      stage: 'scenario:quota-exhausted:ui',
      code: 'EXPECTED_CORE_BOX_FAILURE_NOT_OBSERVED'
    })
  })

  it('accepts only complete bounded Ask interaction evidence', () => {
    expect(isFailureInteractionReady(expectedInteraction())).toBe(true)
    expect(isFailureInteractionReady(expectedInteraction({ queryAccepted: false }))).toBe(false)
    expect(isFailureInteractionReady(expectedInteraction({ candidateFeatureIds: [] }))).toBe(false)
    expect(isFailureInteractionReady(expectedInteraction({ selectedFeatureId: '' }))).toBe(false)
    expect(isFailureInteractionReady(expectedInteraction({ widgetFeatureId: '' }))).toBe(false)
    expect(isFailureInteractionReady(expectedInteraction({ promptAccepted: false }))).toBe(false)
    expect(isFailureInteractionReady(expectedInteraction({ sendReady: false }))).toBe(false)
    expect(isFailureInteractionReady(undefined)).toBe(false)
  })

  it('hashes the physical artifact bytes with SHA-256', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tuff-failure-matrix-hash-test-'))
    const artifact = path.join(root, 'app.asar')
    const bytes = Buffer.from('physical packaged app.asar bytes')
    try {
      await writeFile(artifact, bytes)
      await expect(hashFailureMatrixArtifact(artifact)).resolves.toBe(
        createHash('sha256').update(bytes).digest('hex')
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reads the packaged bundle version and preserves stable runner failure codes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tuff-failure-matrix-bundle-test-'))
    const contents = path.join(root, 'Contents')
    const plist = path.join(contents, 'Info.plist')
    try {
      await mkdir(contents, { recursive: true })
      await writeFile(
        plist,
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>2.4.14-beta.14</string></dict></plist>`,
        'utf8'
      )
      await expect(readFailureMatrixBundleVersion(root)).resolves.toBe('2.4.14-beta.14')

      await writeFile(
        plist,
        `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict></dict></plist>`,
        'utf8'
      )
      let failure: unknown
      try {
        await readFailureMatrixBundleVersion(root)
      } catch (error) {
        failure = error
      }
      expect(projectFailureMatrixFailure(failure, 'app-version')).toEqual({
        stage: 'app-version',
        code: 'PACKAGED_APP_VERSION_FAILED'
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('parses the packaged macOS runner CLI without accepting implicit app identity', () => {
    expect(
      parseFailureMatrixArgs([
        '--appBundle',
        '/tmp/authoritative/tuff.app',
        '--output',
        '/tmp/evidence.json',
        '--remoteDebuggingPort',
        '9811',
        '--launchTimeoutMs',
        '45000',
        '--scenarioTimeoutMs',
        '60000',
        '--no-cleanup',
        '--compact'
      ])
    ).toMatchObject({
      appBundle: '/tmp/authoritative/tuff.app',
      output: '/tmp/evidence.json',
      remoteDebuggingPort: 9811,
      launchTimeoutMs: 45_000,
      scenarioTimeoutMs: 60_000,
      cleanup: false,
      pretty: false
    })
    expect(parseFailureMatrixArgs(['--appBundle', '/tmp/tuff.app', '--cleanup'])).toMatchObject({
      cleanup: true,
      pretty: true
    })
    expect(() => parseFailureMatrixArgs([])).toThrow('--appBundle is required')
    expect(() =>
      parseFailureMatrixArgs(['--appBundle', '/tmp/tuff.app', '--remoteDebuggingPort', '-1'])
    ).toThrow('Invalid --remoteDebuggingPort')
    expect(() => parseFailureMatrixArgs(['--appBundle', '/tmp/tuff.app', '--unknown'])).toThrow(
      'Unknown argument: --unknown'
    )
  })

  it.each(FAILURE_SCENARIOS)('builds credential-free loopback config for %s', (scenario) => {
    const config = buildFailureMatrixConfig(scenario, 18_431) as {
      providers: Array<Record<string, unknown>>
      globalConfig: Record<string, unknown>
      capabilities: Record<string, { providers: Array<Record<string, unknown>> }>
    }
    const serialized = JSON.stringify(config)

    expect(config.globalConfig).toMatchObject({
      enableAudit: true,
      enableCache: false,
      enableQuota: true
    })
    expect(serialized).not.toMatch(/apiKey|authRef|credential|token|secret/i)

    if (scenario === 'no-provider') {
      expect(config.providers).toEqual([])
      expect(config.capabilities['text.chat']?.providers).toEqual([])
      return
    }

    expect(config.providers).toHaveLength(1)
    expect(config.providers[0]).toMatchObject({
      id: FAILURE_PROVIDER_ID,
      type: 'local',
      enabled: true,
      baseUrl: 'http://127.0.0.1:18431',
      models: [FAILURE_PROVIDER_MODEL],
      defaultModel: FAILURE_PROVIDER_MODEL,
      timeout: 1_000,
      capabilities: ['text.chat']
    })
    expect(config.capabilities['text.chat']?.providers).toEqual([
      { providerId: FAILURE_PROVIDER_ID, priority: 1, enabled: true }
    ])
  })

  it('inherits only benign locale/path state into the isolated child env', () => {
    const paths = {
      userDataDir: '/tmp/tuff-failure-profile',
      homeDir: '/tmp/tuff-failure-profile/failure-matrix/home',
      codexHome: '/tmp/tuff-failure-profile/failure-matrix/codex-home',
      tempDir: '/tmp/tuff-failure-profile/failure-matrix/tmp',
      fileProviderRoot: '/tmp/tuff-failure-profile/failure-matrix/file-provider-root',
      missingPiPath: '/tmp/tuff-failure-profile/failure-matrix/missing-pi',
      piAgentDir: '/tmp/tuff-failure-profile/failure-matrix/pi-agent'
    }
    const env = buildFailureMatrixLaunchEnv(
      {
        PATH: '/usr/bin',
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
        LC_CTYPE: 'UTF-8',
        TZ: 'UTC',
        HOME: '/Users/example',
        TMPDIR: '/private/tmp/user',
        CODEX_HOME: '/Users/example/.codex',
        OPENAI_API_KEY: 'openai-canary',
        CUSTOM_API_KEY: 'custom-canary',
        NEXUS_AUTH_TOKEN: 'nexus-canary',
        APP_PASSWORD: 'password-canary',
        GOOGLE_APPLICATION_CREDENTIALS: '/private/google-credentials.json',
        DATABASE_URL: 'postgres://credential-canary',
        GITHUB_PAT: 'github-canary',
        KUBECONFIG: '/private/kubeconfig',
        PGPASSWORD: 'postgres-canary',
        HTTP_PROXY: 'http://proxy-canary',
        HTTPS_PROXY: 'http://proxy-canary',
        NO_PROXY: '127.0.0.1',
        DYLD_INSERT_LIBRARIES: '/private/injected.dylib',
        DYLD_LIBRARY_PATH: '/private/dyld',
        LD_PRELOAD: '/private/injected.so',
        ELECTRON_ENABLE_LOGGING: '1',
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
        ELECTRON_RUN_AS_NODE: '1',
        NODE_OPTIONS: '--require /private/injected.js',
        NODE_EXTRA_CA_CERTS: '/private/ca.pem',
        TUFF_STARTUP_BENCHMARK_ONCE: '1',
        PI_CODING_AGENT_DIR: '/Users/example/pi-agent'
      },
      paths
    )

    expect(env.PATH).toBe('/usr/bin')
    expect(env.LANG).toBe('en_US.UTF-8')
    expect(env.LC_ALL).toBe('en_US.UTF-8')
    expect(env.LC_CTYPE).toBe('UTF-8')
    expect(env.TZ).toBe('UTC')
    expect(env.HOME).toBe(paths.homeDir)
    expect(env.CODEX_HOME).toBe(paths.codexHome)
    expect(env.TMPDIR).toBe(paths.tempDir)
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.CUSTOM_API_KEY).toBeUndefined()
    expect(env.NEXUS_AUTH_TOKEN).toBeUndefined()
    expect(env.APP_PASSWORD).toBeUndefined()
    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined()
    expect(env.DATABASE_URL).toBeUndefined()
    expect(env.GITHUB_PAT).toBeUndefined()
    expect(env.KUBECONFIG).toBeUndefined()
    expect(env.PGPASSWORD).toBeUndefined()
    expect(env.HTTP_PROXY).toBeUndefined()
    expect(env.HTTPS_PROXY).toBeUndefined()
    expect(env.NO_PROXY).toBeUndefined()
    expect(env.DYLD_INSERT_LIBRARIES).toBeUndefined()
    expect(env.DYLD_LIBRARY_PATH).toBeUndefined()
    expect(env.LD_PRELOAD).toBeUndefined()
    expect(env.ELECTRON_ENABLE_LOGGING).toBeUndefined()
    expect(env.ELECTRON_DISABLE_SECURITY_WARNINGS).toBeUndefined()
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.NODE_OPTIONS).toBeUndefined()
    expect(env.NODE_EXTRA_CA_CERTS).toBeUndefined()
    expect(env.TUFF_STARTUP_BENCHMARK_ONCE).toBeUndefined()
    expect(env.TUFF_STARTUP_BENCHMARK_USER_DATA_DIR).toBe(paths.userDataDir)
    expect(env.TUFF_FILE_PROVIDER_BASE_WATCH_PATHS).toBe(paths.fileProviderRoot)
    expect(env.TUFF_PI_CLI_PATH).toBe(paths.missingPiPath)
    expect(env.PI_CODING_AGENT_DIR).toBe(paths.piAgentDir)
    expect(env.TUFF_PACKAGED_ACCEPTANCE_ISOLATED).toBe('1')
    expect(env.TUFF_DISABLE_NATIVE_OCR).toBe('1')
    expect(Object.keys(env).sort()).toEqual(
      [
        'PATH',
        'LANG',
        'LC_ALL',
        'LC_CTYPE',
        'TZ',
        'FORCE_COLOR',
        'HOME',
        'CODEX_HOME',
        'TMPDIR',
        'XDG_CACHE_HOME',
        'XDG_CONFIG_HOME',
        'XDG_DATA_HOME',
        'TUFF_PACKAGED_ACCEPTANCE_ISOLATED',
        'TUFF_STARTUP_BENCHMARK_USER_DATA_DIR',
        'TUFF_FILE_PROVIDER_BASE_WATCH_PATHS',
        'TUFF_PI_CLI_PATH',
        'PI_CODING_AGENT_DIR',
        'TUFF_DISABLE_NATIVE_OCR'
      ].sort()
    )
  })

  it('accepts cleanup only for a direct runner-prefixed child of the temporary root', () => {
    const root = path.join(tmpdir(), 'failure-matrix-cleanup-root')
    const owned = path.join(root, `${FAILURE_PROFILE_PREFIX}owned-id`)

    expect(isFailureMatrixProfileCleanupTarget(owned, root)).toBe(true)
    expect(isFailureMatrixProfileCleanupTarget(path.join(root, FAILURE_PROFILE_PREFIX), root)).toBe(
      false
    )
    expect(
      isFailureMatrixProfileCleanupTarget(
        path.join(root, 'nested', `${FAILURE_PROFILE_PREFIX}owned-id`),
        root
      )
    ).toBe(false)
    expect(isFailureMatrixProfileCleanupTarget(path.join(root, 'ordinary-profile'), root)).toBe(
      false
    )
    expect(
      isFailureMatrixProfileCleanupTarget(
        path.join(path.dirname(root), `${FAILURE_PROFILE_PREFIX}outside`),
        root
      )
    ).toBe(false)
  })

  it('serves unsupported-model as a valid Ollama error envelope', async () => {
    const fixture = await startFailureFixture('unsupported-model')
    try {
      const response = await fetch(`http://127.0.0.1:${fixture.port}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: FAILURE_PROVIDER_MODEL, stream: true })
      })
      const body = await response.text()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/x-ndjson')
      expect(JSON.parse(body.trim())).toEqual({ error: 'unsupported model' })
      expect(fixture.getRequestCount()).toBe(1)
      expect(fixture.getEvidence()).toEqual(FAILURE_SCENARIO_CONTRACTS['unsupported-model'].fixture)
    } finally {
      await fixture.close()
    }
  })

  it('records that the timeout fixture sent headers and a partial delta before holding open', async () => {
    const fixture = await startFailureFixture('timeout')
    try {
      const response = await fetch(`http://127.0.0.1:${fixture.port}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: FAILURE_PROVIDER_MODEL, stream: true })
      })
      const reader = response.body?.getReader()
      const firstChunk = await reader?.read()

      expect(response.status).toBe(200)
      expect(firstChunk?.done).toBe(false)
      expect(firstChunk?.value?.byteLength ?? 0).toBeGreaterThan(0)
      expect(fixture.getEvidence()).toEqual(FAILURE_SCENARIO_CONTRACTS.timeout.fixture)

      await reader?.cancel()
    } finally {
      await fixture.close()
    }
  })

  it('persists explicit consent for the Intelligence root search provider', async () => {
    const { send, mock } = mockMainEventSender(async (eventName, payload) => {
      if (eventName.endsWith('provider-config.get')) {
        return {
          providers: [
            {
              descriptor: {},
              providerId: 'system.default',
              enabled: true,
              order: 4,
              updatedAt: 10
            },
            {
              descriptor: {},
              providerId: FAILURE_SEARCH_PROVIDER_ID,
              enabled: false,
              order: 8
            }
          ]
        }
      }
      const request = payload as {
        providers: Array<{
          providerId: string
          enabled: boolean
          order: number
          updatedAt?: number
        }>
      }
      expect(request.providers).toEqual([
        {
          providerId: 'system.default',
          enabled: true,
          order: 4,
          updatedAt: 10
        },
        {
          providerId: FAILURE_SEARCH_PROVIDER_ID,
          enabled: true,
          order: 8,
          updatedAt: 20
        }
      ])
      return {
        providers: [
          {
            descriptor: {},
            providerId: FAILURE_SEARCH_PROVIDER_ID,
            enabled: true,
            order: 8,
            updatedAt: 20
          }
        ]
      }
    })

    await expect(enableFailureSearchProvider(send, 20)).resolves.toBe(true)
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it('fails closed when the packaged provider registry omits the Intelligence provider', async () => {
    const { send, mock } = mockMainEventSender(async () => ({ providers: [] }))

    await expect(enableFailureSearchProvider(send)).resolves.toBe(false)
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('waits for discovery, enables once, and verifies the final plugin status', async () => {
    const statuses = [-1, 0, 3]
    const { send, mock } = mockMainEventSender(async (eventName, payload) => {
      expect(payload).toEqual({ name: 'touch-intelligence' })
      return eventName.endsWith('get-status') ? statuses.shift() : { success: true }
    })

    await expect(
      enableFailurePlugin(send, { attempts: 3, pollIntervalMs: 0, wait: async () => {} })
    ).resolves.toBe(true)
    expect(mock).toHaveBeenCalledTimes(4)
    expect(mock.mock.calls.filter(([eventName]) => eventName.endsWith('enable'))).toHaveLength(1)
  })

  it('observes an activation already racing through LOADING without a second enable', async () => {
    const statuses = [5, 3]
    const { send, mock } = mockMainEventSender(async () => statuses.shift())

    await expect(
      enableFailurePlugin(send, { attempts: 2, pollIntervalMs: 0, wait: async () => {} })
    ).resolves.toBe(true)
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it('fails closed when the packaged Intelligence plugin is never discovered', async () => {
    const { send, mock } = mockMainEventSender(async () => -1)

    await expect(
      enableFailurePlugin(send, { attempts: 2, pollIntervalMs: 0, wait: async () => {} })
    ).resolves.toBe(false)
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it('writes the ownership marker before exposing a fresh profile', async () => {
    let allocated: PreparedProfile | undefined
    let profileRemoved = false
    try {
      const preparation = prepareFailureMatrixProfile('timeout', 18_431, (profile) => {
        allocated = profile
        const marker = JSON.parse(
          readFileSync(path.join(profile.userDataDir, FAILURE_PROFILE_MARKER), 'utf8')
        ) as Record<string, unknown>
        expect(marker).toEqual({
          schema: FAILURE_PROFILE_SCHEMA,
          scenario: 'timeout',
          ownershipToken: profile.ownershipToken
        })
        throw new Error('PROFILE_CALLBACK_STOP')
      })

      await expect(preparation).rejects.toThrow('PROFILE_CALLBACK_STOP')
      expect(allocated).toBeDefined()
    } finally {
      if (allocated) {
        profileRemoved = await cleanupFailureMatrixProfile(allocated, 'timeout')
      }
    }
    expect(profileRemoved).toBe(true)
  })

  it.each(['sync', 'async'] as const)(
    'projects %s spawn failures and still cleans owned resources',
    async (mode) => {
      const child = Object.assign(new EventEmitter(), {
        pid: undefined,
        exitCode: null,
        signalCode: null
      }) as unknown as ChildProcess
      const closeFixture = vi.fn(async () => undefined)
      const cleanupProfile = vi.fn(async () => true)
      const supervisor = new FailureScenarioSupervisor('timeout', true, {
        launchPackagedApp:
          mode === 'sync'
            ? () => {
                throw new Error('native spawn detail /private/app')
              }
            : () => child,
        cleanupFailureMatrixProfile: cleanupProfile
      })
      supervisor.setFixture({
        port: 1,
        getRequestCount: () => 0,
        getEvidence: () => fixtureEvidence(),
        close: closeFixture
      })
      supervisor.setProfile(preparedProfileFixture(`${mode}-spawn`))

      const launch = supervisor.launch('/private/missing/tuff', 9_811)
      if (mode === 'async') {
        queueMicrotask(() => child.emit('error', new Error('native spawn detail /private/app')))
      }

      await expect(launch).rejects.toThrow('PACKAGED_APP_SPAWN_FAILED')
      expect(supervisor.processStopped).toBe(true)
      await expect(supervisor.shutdown()).resolves.toEqual([])
      expect(closeFixture).toHaveBeenCalledOnce()
      expect(cleanupProfile).toHaveBeenCalledOnce()
      expect(
        JSON.stringify(await launch.catch((error) => ({ message: error.message })))
      ).not.toContain('/private/app')
    }
  )

  it('shares one ordered shutdown across repeated interrupts', async () => {
    const order: string[] = []
    const child = Object.assign(new EventEmitter(), {
      pid: 42_424,
      exitCode: null,
      signalCode: null
    }) as unknown as ChildProcess
    const supervisor = new FailureScenarioSupervisor('timeout', true, {
      launchPackagedApp: () => child,
      waitForPackagedAppSpawn: async () => undefined,
      stopOwnedProcess: async () => {
        order.push('stop')
        return true
      },
      waitForPortRelease: async () => {
        order.push('port')
      },
      cleanupFailureMatrixProfile: async () => {
        order.push('profile')
        return true
      }
    })
    supervisor.setFixture({
      port: 1,
      getRequestCount: () => 1,
      getEvidence: () => fixtureEvidence({ requests: 1 }),
      close: async () => {
        order.push('fixture')
      }
    })
    supervisor.setProfile(preparedProfileFixture('ordered-shutdown'))
    supervisor.setCdpPort(9_811)
    await supervisor.launch('/tmp/tuff', 9_811)

    const first = supervisor.interrupt()
    const second = supervisor.interrupt()

    expect(second).toBe(first)
    await expect(first).resolves.toEqual([])
    expect(order).toEqual(['stop', 'port', 'fixture', 'profile'])
    expect(supervisor.processStopped).toBe(true)
    expect(supervisor.fixtureClosed).toBe(true)
    expect(supervisor.profileRemoved).toBe(true)
  })

  it('continues fixture and profile cleanup after port release fails', async () => {
    const order: string[] = []
    const supervisor = new FailureScenarioSupervisor('timeout', true, {
      waitForPortRelease: async () => {
        order.push('port')
        throw new Error('port failure detail')
      },
      cleanupFailureMatrixProfile: async () => {
        order.push('profile')
        return true
      }
    })
    supervisor.setFixture({
      port: 1,
      getRequestCount: () => 0,
      getEvidence: () => fixtureEvidence(),
      close: async () => {
        order.push('fixture')
      }
    })
    supervisor.setProfile(preparedProfileFixture('port-failure'))
    supervisor.setCdpPort(9_811)

    const failures = await supervisor.interrupt()

    expect(order).toEqual(['port', 'fixture', 'profile'])
    expect(failures).toEqual([
      { stage: 'scenario:timeout:process-cleanup', code: 'FAILURE_MATRIX_STEP_FAILED' }
    ])
    expect(supervisor.fixtureClosed).toBe(true)
    expect(supervisor.profileRemoved).toBe(true)
  })

  it('keeps signal handlers active until disposal and maps conventional exit codes', () => {
    const emitter = new EventEmitter()
    const source = emitter as unknown as FailureMatrixSignalSource
    const observed: string[] = []
    const dispose = installFailureMatrixSignalHandlers((signal) => observed.push(signal), source)

    emitter.emit('SIGTERM')
    emitter.emit('SIGTERM')
    emitter.emit('SIGINT')
    expect(observed).toEqual(['SIGTERM', 'SIGTERM', 'SIGINT'])
    expect(failureMatrixSignalExitCode('SIGINT')).toBe(130)
    expect(failureMatrixSignalExitCode('SIGTERM')).toBe(143)

    dispose()
    emitter.emit('SIGTERM')
    expect(observed).toHaveLength(3)
  })

  it('projects unknown failures without preserving raw errors, paths, or credentials', () => {
    const projection = projectFailureMatrixFailure(
      new Error('apiKey=top-secret under /Users/example/private/profile'),
      'scenario-run'
    )

    expect(projection).toEqual({
      stage: 'scenario-run',
      code: 'FAILURE_MATRIX_STEP_FAILED'
    })
    expect(JSON.stringify(projection)).not.toContain('top-secret')
    expect(JSON.stringify(projection)).not.toContain('/Users/example')
  })

  it('projects UI details to presence flags without retaining reason or recovery text', () => {
    const projection = projectFailureUiEvidence({
      code: 'NETWORK_FAILURE',
      reason: 'reason-canary /Users/example/private/profile',
      recovery: 'recovery-canary apiKey=top-secret',
      noticeVisible: true,
      busyCleared: true,
      retryVisible: true,
      intelligenceSettingsVisible: true,
      permissionSettingsVisible: false
    })
    const serialized = JSON.stringify(projection)

    expect(projection).toEqual({
      code: 'NETWORK_FAILURE',
      reasonPresent: true,
      recoveryPresent: true,
      noticeVisible: true,
      busyCleared: true,
      retryVisible: true,
      intelligenceSettingsVisible: true,
      permissionSettingsVisible: false
    })
    expect(serialized).not.toContain('reason-canary')
    expect(serialized).not.toContain('recovery-canary')
    expect(serialized).not.toContain('/Users/example')
    expect(serialized).not.toContain('top-secret')
    expect(projection).not.toHaveProperty('reason')
    expect(projection).not.toHaveProperty('recovery')
  })

  it('normalizes unexpected UI error codes before they enter persisted evidence', () => {
    expect(
      projectFailureUiEvidence({
        ...expectedUi('timeout'),
        code: 'raw-error /Users/example apiKey=secret'
      })
    ).toMatchObject({
      code: 'UNKNOWN',
      reasonPresent: true,
      recoveryPresent: true
    })
  })

  it('accepts a complete report containing only bounded, stable evidence', () => {
    expect(isFailureMatrixReportRedacted(redactedReportFixture())).toBe(true)
  })

  it.each([
    ['absolute POSIX path', { diagnostic: '/tmp/tuff-ai-failure-matrix-owned' }],
    ['absolute Windows path', { diagnostic: 'C:\\Users\\example\\profile' }],
    ['file URI', { diagnostic: 'file:///tmp/tuff-ai-failure-matrix-owned' }],
    ['reason text', { reason: 'provider-native reason' }],
    ['recovery text', { recovery: 'provider-native recovery' }],
    ['raw error', { rawError: 'native provider error' }],
    ['raw DOM', { rawDom: '<div>private widget state</div>' }],
    ['request body', { requestBody: { messages: ['private prompt'] } }],
    ['response body', { responseBody: 'private provider response' }],
    ['query', { query: 'private query' }],
    ['input value', { inputValue: 'private prompt' }],
    ['prompt', { prompt: 'private prompt' }],
    ['credential', { credential: 'credential-canary' }],
    ['API key', { apiKey: 'api-key-canary' }],
    ['token', { token: 'token-canary' }],
    ['secret', { secret: 'secret-canary' }],
    ['stack', { stack: 'native stack canary' }],
    ['endpoint', { endpoint: 'http://127.0.0.1:1234/api/chat' }],
    ['profile path field', { userDataDir: 'relative-profile-that-still-must-not-persist' }]
  ] as Array<[string, Record<string, unknown>]>)('rejects %s from persisted reports', (_, leak) => {
    expect(
      isFailureMatrixReportRedacted({
        ...redactedReportFixture(),
        leak
      })
    ).toBe(false)
  })

  it('rejects cyclic evidence instead of silently accepting an unserializable report', () => {
    const report = redactedReportFixture()
    report.cycle = report

    expect(isFailureMatrixReportRedacted(report)).toBe(false)
  })

  it('computes caller audit plus day/month usage deltas from non-zero baselines', () => {
    const before = ledgerSnapshot({
      auditCount: 7,
      auditSuccessCount: 3,
      auditFailureCount: 4,
      auditTotalTokens: 90,
      auditTotalCost: 0.25,
      dayRequestCount: 7,
      daySuccessCount: 3,
      dayFailureCount: 4,
      dayTotalTokens: 90,
      dayTotalCost: 0.25,
      monthRequestCount: 20,
      monthSuccessCount: 12,
      monthFailureCount: 8,
      monthTotalTokens: 400,
      monthTotalCost: 1.5
    })
    const after = ledgerSnapshot({
      auditCount: 8,
      auditSuccessCount: 3,
      auditFailureCount: 5,
      auditTotalTokens: 90,
      auditTotalCost: 0.25,
      dayRequestCount: 8,
      daySuccessCount: 3,
      dayFailureCount: 5,
      dayTotalTokens: 90,
      dayTotalCost: 0.25,
      monthRequestCount: 21,
      monthSuccessCount: 12,
      monthFailureCount: 9,
      monthTotalTokens: 400,
      monthTotalCost: 1.5
    })

    expect(summarizeFailureLedgerDelta(before, after)).toEqual({
      auditDelta: 1,
      auditSuccessDelta: 0,
      auditFailureDelta: 1,
      auditTokenDelta: 0,
      auditCostDelta: 0,
      day: {
        requestDelta: 1,
        successDelta: 0,
        failureDelta: 1,
        tokenDelta: 0,
        costDelta: 0
      },
      month: {
        requestDelta: 1,
        successDelta: 0,
        failureDelta: 1,
        tokenDelta: 0,
        costDelta: 0
      }
    })
  })

  it.each(['no-provider', 'quota-exhausted', 'permission-denied'] as const)(
    'requires a completely unchanged ledger for %s',
    (scenario) => {
      const baseline = ledgerSnapshot({
        auditCount: 2,
        auditFailureCount: 2,
        dayRequestCount: 2,
        dayFailureCount: 2,
        monthRequestCount: 5,
        monthFailureCount: 5
      })
      const unchanged = summarizeFailureLedgerDelta(baseline, baseline)

      expect(failureLedgerMatchesContract(FAILURE_SCENARIO_CONTRACTS[scenario], unchanged)).toBe(
        true
      )
      expect(
        failureLedgerMatchesContract(
          FAILURE_SCENARIO_CONTRACTS[scenario],
          summarizeFailureLedgerDelta(
            baseline,
            ledgerSnapshot({
              auditCount: 3,
              auditFailureCount: 3,
              dayRequestCount: 3,
              dayFailureCount: 3,
              monthRequestCount: 6,
              monthFailureCount: 6
            })
          )
        )
      ).toBe(false)
    }
  )

  it.each(['unsupported-model', 'timeout'] as const)(
    'requires exactly one zero-token failure in audit, day, and month for %s',
    (scenario) => {
      const before = ledgerSnapshot()
      const passing = summarizeFailureLedgerDelta(
        before,
        ledgerSnapshot({
          auditCount: 1,
          auditFailureCount: 1,
          dayRequestCount: 1,
          dayFailureCount: 1,
          monthRequestCount: 1,
          monthFailureCount: 1
        })
      )
      const contract = FAILURE_SCENARIO_CONTRACTS[scenario]

      expect(failureLedgerMatchesContract(contract, passing)).toBe(true)
      expect(
        failureLedgerMatchesContract(contract, {
          ...passing,
          auditTokenDelta: 1
        })
      ).toBe(false)
      expect(
        failureLedgerMatchesContract(contract, {
          ...passing,
          day: { ...passing.day, requestDelta: 0, failureDelta: 0 }
        })
      ).toBe(false)
      expect(
        failureLedgerMatchesContract(contract, {
          ...passing,
          month: { ...passing.month, successDelta: 1, failureDelta: 0 }
        })
      ).toBe(false)
      expect(
        failureLedgerMatchesContract(contract, {
          ...passing,
          auditCostDelta: 0.01
        })
      ).toBe(false)
    }
  )

  it.each(FAILURE_SCENARIOS)('accepts only the complete %s scenario evidence', (scenario) => {
    const contract = FAILURE_SCENARIO_CONTRACTS[scenario]
    expect(
      assessFailureScenario({
        contract,
        ui: expectedUi(scenario),
        fixture: contract.fixture,
        ledger: expectedLedgerDelta(scenario),
        requiredPermissionsGranted: true,
        searchProviderEnabled: true,
        pluginEnabled: true,
        intelligencePermissionRevoked: scenario === 'permission-denied',
        quotaDisabled: scenario === 'quota-exhausted',
        interaction: expectedInteraction(),
        fixtureClosed: true,
        cleanupRequested: true,
        processStopped: true,
        profileRemoved: true
      })
    ).toBe(true)
  })

  it.each(['responseHeadersSent', 'partialDeltaSent', 'bodyHeldOpen'] as const)(
    'rejects timeout evidence missing fixture.%s',
    (field) => {
      const contract = FAILURE_SCENARIO_CONTRACTS.timeout
      const incompleteFixture: Partial<FailureFixtureEvidence> = { ...contract.fixture }
      delete incompleteFixture[field]

      expect(
        assessFailureScenario({
          contract,
          ui: expectedUi('timeout'),
          fixture: incompleteFixture as FailureFixtureEvidence,
          ledger: expectedLedgerDelta('timeout'),
          requiredPermissionsGranted: true,
          searchProviderEnabled: true,
          pluginEnabled: true,
          intelligencePermissionRevoked: false,
          quotaDisabled: false,
          interaction: expectedInteraction(),
          fixtureClosed: true,
          cleanupRequested: true,
          processStopped: true,
          profileRemoved: true
        })
      ).toBe(false)
    }
  )

  it('rejects incomplete UI, fixture, prerequisite, ledger, process, and cleanup evidence', () => {
    const scenario = 'timeout' as const
    const contract = FAILURE_SCENARIO_CONTRACTS[scenario]
    const input = {
      contract,
      ui: expectedUi(scenario),
      fixture: contract.fixture,
      ledger: expectedLedgerDelta(scenario),
      requiredPermissionsGranted: true,
      searchProviderEnabled: true,
      pluginEnabled: true,
      intelligencePermissionRevoked: false,
      quotaDisabled: false,
      interaction: expectedInteraction(),
      fixtureClosed: true,
      cleanupRequested: true,
      processStopped: true,
      profileRemoved: true
    }

    expect(assessFailureScenario({ ...input, ui: { ...input.ui, code: 'UNKNOWN' } })).toBe(false)
    expect(assessFailureScenario({ ...input, ui: { ...input.ui, reason: '' } })).toBe(false)
    expect(assessFailureScenario({ ...input, ui: { ...input.ui, recovery: '' } })).toBe(false)
    expect(assessFailureScenario({ ...input, ui: { ...input.ui, noticeVisible: false } })).toBe(
      false
    )
    expect(assessFailureScenario({ ...input, ui: { ...input.ui, busyCleared: false } })).toBe(false)
    expect(assessFailureScenario({ ...input, ui: { ...input.ui, retryVisible: false } })).toBe(
      false
    )
    expect(
      assessFailureScenario({
        ...input,
        ui: { ...input.ui, intelligenceSettingsVisible: false }
      })
    ).toBe(false)
    expect(assessFailureScenario({ ...input, fixture: { ...input.fixture, requests: 0 } })).toBe(
      false
    )
    expect(
      assessFailureScenario({
        ...input,
        fixture: { ...input.fixture, responseHeadersSent: false }
      })
    ).toBe(false)
    expect(
      assessFailureScenario({
        ...input,
        fixture: { ...input.fixture, partialDeltaSent: false }
      })
    ).toBe(false)
    expect(
      assessFailureScenario({ ...input, fixture: { ...input.fixture, bodyHeldOpen: false } })
    ).toBe(false)
    expect(
      assessFailureScenario({
        ...input,
        ledger: { ...input.ledger, auditFailureDelta: 0 }
      })
    ).toBe(false)
    expect(assessFailureScenario({ ...input, requiredPermissionsGranted: false })).toBe(false)
    expect(assessFailureScenario({ ...input, searchProviderEnabled: false })).toBe(false)
    expect(assessFailureScenario({ ...input, pluginEnabled: false })).toBe(false)
    expect(assessFailureScenario({ ...input, intelligencePermissionRevoked: true })).toBe(false)
    expect(assessFailureScenario({ ...input, quotaDisabled: true })).toBe(false)
    expect(assessFailureScenario({ ...input, fixtureClosed: false })).toBe(false)
    expect(assessFailureScenario({ ...input, cleanupRequested: false })).toBe(false)
    expect(assessFailureScenario({ ...input, processStopped: false })).toBe(false)
    expect(assessFailureScenario({ ...input, profileRemoved: false })).toBe(false)
  })

  it.each([
    ['query', { queryAccepted: false }],
    ['candidate', { candidateFeatureIds: [] }],
    ['selection', { selectedFeatureId: '' }],
    ['widget', { widgetFeatureId: '' }],
    ['prompt', { promptAccepted: false }],
    ['send', { sendReady: false }]
  ] as Array<[string, Partial<FailureInteractionEvidence>]>)(
    'rejects incomplete %s interaction evidence',
    (_, interactionOverride) => {
      const contract = FAILURE_SCENARIO_CONTRACTS.timeout
      expect(
        assessFailureScenario({
          contract,
          ui: expectedUi('timeout'),
          fixture: contract.fixture,
          ledger: expectedLedgerDelta('timeout'),
          requiredPermissionsGranted: true,
          searchProviderEnabled: true,
          pluginEnabled: true,
          intelligencePermissionRevoked: false,
          quotaDisabled: false,
          interaction: expectedInteraction(interactionOverride),
          fixtureClosed: true,
          cleanupRequested: true,
          processStopped: true,
          profileRemoved: true
        })
      ).toBe(false)
    }
  )

  it('requires the permission and quota preconditions only in their owning scenarios', () => {
    const permissionContract = FAILURE_SCENARIO_CONTRACTS['permission-denied']
    const quotaContract = FAILURE_SCENARIO_CONTRACTS['quota-exhausted']

    expect(
      assessFailureScenario({
        contract: permissionContract,
        ui: expectedUi('permission-denied'),
        fixture: permissionContract.fixture,
        ledger: expectedLedgerDelta('permission-denied'),
        requiredPermissionsGranted: true,
        searchProviderEnabled: true,
        pluginEnabled: true,
        intelligencePermissionRevoked: false,
        quotaDisabled: false,
        interaction: expectedInteraction(),
        fixtureClosed: true,
        cleanupRequested: true,
        processStopped: true,
        profileRemoved: true
      })
    ).toBe(false)
    expect(
      assessFailureScenario({
        contract: quotaContract,
        ui: expectedUi('quota-exhausted'),
        fixture: quotaContract.fixture,
        ledger: expectedLedgerDelta('quota-exhausted'),
        requiredPermissionsGranted: true,
        searchProviderEnabled: true,
        pluginEnabled: true,
        intelligencePermissionRevoked: false,
        quotaDisabled: false,
        interaction: expectedInteraction(),
        fixtureClosed: true,
        cleanupRequested: true,
        processStopped: true,
        profileRemoved: true
      })
    ).toBe(false)
  })
})
