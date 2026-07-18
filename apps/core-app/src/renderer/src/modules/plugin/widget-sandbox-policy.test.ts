// @vitest-environment jsdom
import type { WidgetSandboxEvidence } from '@talex-touch/utils/plugin/widget'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WIDGET_SANDBOX_AUDIT_MAX_ENTRIES,
  WIDGET_SANDBOX_QUOTA_MAX_CALLS,
  WIDGET_SANDBOX_QUOTA_WINDOW_MS,
  assertWidgetDynamicSource,
  clearWidgetSandboxAuditLog,
  createWidgetSandboxPolicy,
  disposeWidgetSandboxPolicy,
  getWidgetSandboxAuditLog,
  guardWidgetDomNavigation
} from './widget-sandbox-policy'

let widgetSequence = 0
const activeWidgetIds = new Set<string>()

function createEvidence(widgetId: string): WidgetSandboxEvidence {
  return {
    widgetId,
    pluginName: 'sandbox-test-plugin',
    featureId: 'sandbox-test-feature',
    sourceType: 'js',
    declaredDependencies: [],
    allowedDependencies: [],
    blockedDependencies: [],
    undeclaredDependencies: [],
    storageFacade: {
      localStorage: 'secure-namespaced',
      sessionStorage: 'memory-namespaced',
      cookies: 'secure-namespaced',
      indexedDB: 'plugin-namespaced',
      caches: 'plugin-namespaced',
      broadcastChannel: 'plugin-namespaced'
    },
    browserFacade: {
      clipboard: 'blocked-use-host-action',
      history: 'memory-isolated',
      location: 'read-only-snapshot',
      postMessage: 'widget-local',
      worker: 'blocked',
      serviceWorker: 'blocked',
      network: 'blocked-use-host-action',
      domNavigation: 'blocked'
    },
    windowBoundary: {
      opener: 'null',
      top: 'sandbox-proxy',
      parent: 'sandbox-proxy',
      self: 'sandbox-proxy',
      globalThis: 'sandbox-proxy',
      documentDefaultView: 'sandbox-proxy',
      documentRealm: 'detached-document'
    },
    quota: {
      windowMs: WIDGET_SANDBOX_QUOTA_WINDOW_MS,
      maxCalls: WIDGET_SANDBOX_QUOTA_MAX_CALLS,
      usedCalls: 0,
      blockedCalls: 0,
      resetsAt: 0
    },
    audit: {
      mode: 'bounded-memory',
      maxEntries: WIDGET_SANDBOX_AUDIT_MAX_ENTRIES,
      payloads: 'excluded'
    },
    dynamicExecution: {
      mode: 'guarded-new-function',
      realm: 'same-realm',
      boundary: 'host-api-containment',
      sourcePreflight: 'lexical-denylist',
      injectedGlobals: [],
      limitations: [
        'Shares JavaScript intrinsics with the host renderer',
        'Not a process, origin, or realm isolation boundary'
      ]
    }
  }
}

function createPolicy() {
  const widgetId = `sandbox-test::${widgetSequence++}`
  activeWidgetIds.add(widgetId)
  return {
    context: createWidgetSandboxPolicy('sandbox-test-plugin', widgetId, createEvidence(widgetId)),
    widgetId
  }
}

afterEach(() => {
  for (const widgetId of activeWidgetIds) {
    disposeWidgetSandboxPolicy(widgetId)
    clearWidgetSandboxAuditLog(widgetId)
  }
  activeWidgetIds.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('widget sandbox browser containment', () => {
  it('keeps host clipboard, history, and location untouched while preserving local history', async () => {
    const hostClipboardWrite = vi.fn()
    vi.stubGlobal('navigator', { clipboard: { writeText: hostClipboardWrite } })
    const { context } = createPolicy()
    const hostUrl = window.location.href
    const hostHistoryLength = window.history.length

    await expect(context.navigator.clipboard.writeText('widget-secret')).rejects.toThrow(
      'typed clipboard host action'
    )
    context.history.pushState({ step: 'widget-only' }, '', '/widget-only')
    expect(context.history.state).toEqual({ step: 'widget-only' })
    expect(context.location.pathname).toBe('/widget-only')
    expect(() => context.location.assign('https://outside.invalid/')).toThrow('navigation')

    expect(hostClipboardWrite).not.toHaveBeenCalled()
    expect(window.history.length).toBe(hostHistoryLength)
    expect(window.location.href).toBe(hostUrl)
  })

  it('keeps postMessage widget-local and omits message payloads from audit records', async () => {
    const { context, widgetId } = createPolicy()
    const hostMessages = vi.fn()
    const localMessages = vi.fn()
    window.addEventListener('message', hostMessages)
    context.addEventListener('message', localMessages)

    context.postMessage({ privateContent: 'do-not-audit-this' }, '*')
    await Promise.resolve()

    window.removeEventListener('message', hostMessages)
    expect(hostMessages).not.toHaveBeenCalled()
    expect(localMessages.mock.calls[0]?.[0]).toMatchObject({
      data: { privateContent: 'do-not-audit-this' },
      origin: 'null'
    })

    const audit = getWidgetSandboxAuditLog(widgetId)
    expect(audit).toEqual([
      expect.objectContaining({ decision: 'allowed', operation: 'postMessage' })
    ])
    expect(Object.keys(audit[0] ?? {}).sort()).toEqual([
      'decision',
      'operation',
      'pluginName',
      'reason',
      'sequence',
      'timestamp',
      'widgetId'
    ])
    expect(JSON.stringify(audit)).not.toContain('do-not-audit-this')
  })

  it('retains only the bounded number of payload-free audit decisions', () => {
    vi.useFakeTimers()
    const { context, widgetId } = createPolicy()
    const firstReason = 'audit-decision-0'
    for (let call = 0; call <= WIDGET_SANDBOX_AUDIT_MAX_ENTRIES; call += 1) {
      context.allow('postMessage', `audit-decision-${call}`)
      vi.advanceTimersByTime(WIDGET_SANDBOX_QUOTA_WINDOW_MS)
    }

    const audit = getWidgetSandboxAuditLog(widgetId)
    expect(audit).toHaveLength(WIDGET_SANDBOX_AUDIT_MAX_ENTRIES)
    expect(audit.some((entry) => entry.reason === firstReason)).toBe(false)
    expect(audit.at(-1)).toMatchObject({
      decision: 'allowed',
      operation: 'postMessage',
      reason: `audit-decision-${WIDGET_SANDBOX_AUDIT_MAX_ENTRIES}`
    })
  })

  it('fails closed for worker and raw transport constructors', async () => {
    const { context } = createPolicy()

    expect(() => new context.Worker('worker.js')).toThrow('Worker is unavailable')
    expect(() => new context.SharedWorker('worker.js')).toThrow('SharedWorker is unavailable')
    expect(() => new context.XMLHttpRequest()).toThrow(
      'XMLHttpRequest must use a typed host action'
    )
    expect(() => new context.WebSocket('wss://transport.invalid')).toThrow(
      'WebSocket must use a typed host action'
    )
    expect(() => new context.EventSource('https://transport.invalid/events')).toThrow(
      'EventSource must use a typed host action'
    )
    await expect(context.fetch('https://transport.invalid/')).rejects.toThrow(
      'fetch must use a typed host action'
    )
  })

  it('enforces the fixed sensitive-operation budget and records quota exhaustion', () => {
    const { context, widgetId } = createPolicy()
    for (let call = 0; call < WIDGET_SANDBOX_QUOTA_MAX_CALLS; call += 1) {
      context.allow('postMessage', 'widget-local-message-target')
    }

    expect(() => context.allow('postMessage', 'widget-local-message-target')).toThrow(
      'call budget exhausted'
    )
    expect(getWidgetSandboxAuditLog(widgetId).at(-1)).toMatchObject({
      decision: 'quota-exceeded',
      operation: 'postMessage',
      reason: 'fixed-window-call-budget-exhausted'
    })
  })

  it.each([
    ['eval', 'eval("2 + 2")'],
    ['Function', 'Function("return 2")'],
    ['dynamic import', 'import("plugin")'],
    ['WebAssembly', 'WebAssembly.compile(bytes)'],
    ['constructor escape', '({}).constructor("return 2")']
  ])('rejects %s dynamic source before widget evaluation', (_name, source) => {
    const { widgetId } = createPolicy()

    try {
      assertWidgetDynamicSource(widgetId, source)
      throw new Error('dynamic source unexpectedly reached evaluation')
    } catch (error) {
      expect(error).toMatchObject({ code: 'WIDGET_SANDBOX_DYNAMIC_CODE_BLOCKED' })
    }
  })

  it('prevents anchor and form navigation before it reaches the host browser', () => {
    const { widgetId } = createPolicy()
    const anchor = document.createElement('a')
    const form = document.createElement('form')
    const anchorClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    const formSubmit = new Event('submit', { bubbles: true, cancelable: true })
    Object.defineProperty(anchorClick, 'composedPath', { value: () => [anchor] })
    Object.defineProperty(formSubmit, 'composedPath', { value: () => [form] })

    expect(guardWidgetDomNavigation(widgetId, anchorClick)).toBe(true)
    expect(guardWidgetDomNavigation(widgetId, formSubmit)).toBe(true)
    expect(anchorClick.defaultPrevented).toBe(true)
    expect(formSubmit.defaultPrevented).toBe(true)
    expect(getWidgetSandboxAuditLog(widgetId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: 'dom.navigation', decision: 'denied' })
      ])
    )
  })

  it('disposal removes a policy context from live local-message delivery', async () => {
    const { context, widgetId } = createPolicy()
    const messages = vi.fn()
    context.addEventListener('message', messages)

    disposeWidgetSandboxPolicy(widgetId)
    activeWidgetIds.delete(widgetId)

    expect(() => context.postMessage({ after: 'dispose' }, '*')).toThrow('sandbox policy disposed')
    await Promise.resolve()

    expect(messages).not.toHaveBeenCalled()
  })
})
