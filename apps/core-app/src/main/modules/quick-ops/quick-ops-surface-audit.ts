import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const QUICK_OPS_SURFACE_AUDIT_SCHEMA = 'quickops-surface-audit/v1'

export const QUICK_OPS_SURFACE_AUDIT_EXPECTED_TRANSPORT_EVENTS = [
  'QuickOpsEvents.capabilities.get',
  'QuickOpsEvents.sessions.get',
  'QuickOpsEvents.audit.get',
  'QuickOpsEvents.systemInfo.get',
  'QuickOpsEvents.tuffDiagnostics.get',
  'QuickOpsEvents.diskSpace.get',
  'QuickOpsEvents.directoryUsage.get',
  'QuickOpsEvents.queryLocalIp.get',
  'QuickOpsEvents.portStatus.get',
  'QuickOpsEvents.dnsQuery.get',
  'QuickOpsEvents.fileHash.get',
  'QuickOpsEvents.fileBase64.get',
  'QuickOpsEvents.recentDownload.get',
  'QuickOpsEvents.commonDirectory.get',
  'QuickOpsEvents.pathFormat.get',
  'QuickOpsEvents.formatText.get',
  'QuickOpsEvents.networkStatus.get',
  'QuickOpsEvents.batteryStatus.get',
  'QuickOpsEvents.systemProxy.get'
] as const

export const QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS = [
  'capabilities',
  'sessions',
  'auditRecent',
  'systemInfo',
  'tuffDiagnostics',
  'diskSpace',
  'directoryUsage',
  'queryLocalIp',
  'portStatus',
  'dnsQuery',
  'fileHash',
  'fileBase64',
  'recentDownload',
  'commonDirectory',
  'pathFormat',
  'formatText',
  'networkStatus',
  'batteryStatus',
  'systemProxy'
] as const

const RAW_IPC_PREFIX = '@'
const QUICK_OPS_EVENT_PARTS = [
  ['quick-ops', 'capabilities', 'get'],
  ['quick-ops', 'sessions', 'get'],
  ['quick-ops', 'audit', 'get'],
  ['quick-ops', 'system-info', 'get'],
  ['quick-ops', 'tuff-diagnostics', 'get'],
  ['quick-ops', 'disk-space', 'get'],
  ['quick-ops', 'directory-usage', 'get'],
  ['quick-ops', 'query-local-ip', 'get'],
  ['quick-ops', 'port-status', 'get'],
  ['quick-ops', 'dns-query', 'get'],
  ['quick-ops', 'file-hash', 'get'],
  ['quick-ops', 'file-base64', 'get'],
  ['quick-ops', 'recent-download', 'get'],
  ['quick-ops', 'common-directory', 'get'],
  ['quick-ops', 'path-format', 'get'],
  ['quick-ops', 'format-text', 'get'],
  ['quick-ops', 'network-status', 'get'],
  ['quick-ops', 'battery-status', 'get'],
  ['quick-ops', 'system-proxy', 'get']
] as const

const FORBIDDEN_PUBLIC_SURFACE_PATTERNS = [
  'regChannel',
  'ipcMain',
  `${RAW_IPC_PREFIX}main-process-message`,
  `${RAW_IPC_PREFIX}plugin-process-message`,
  ['quickops', ''].join(':'),
  ...QUICK_OPS_EVENT_PARTS.map((parts) => parts.join(':'))
] as const

const FORBIDDEN_SDK_METHOD_NAMES = [
  'keepAwake',
  'systemAwake',
  'startTimer',
  'startPomodoro',
  'cleanScreen',
  'startStopwatch',
  'showNotification',
  'copyToClipboard',
  'openFolder',
  'stopAllSessions'
] as const

export interface QuickOpsSurfaceAuditFileInput {
  repoRoot: string
  modulePath?: string
  transportSdkPath?: string
  pluginSdkPath?: string
  pluginRuntimePath?: string
}

export interface QuickOpsSurfaceAuditSourceInput {
  moduleSource: string
  transportSdkSource: string
  pluginSdkSource: string
  pluginRuntimeSource: string
  generatedAt?: string
}

export interface QuickOpsSurfaceAuditResult {
  schema: typeof QUICK_OPS_SURFACE_AUDIT_SCHEMA
  generatedAt: string
  transport: {
    expectedEvents: string[]
    registeredEvents: string[]
    onlyExpectedTypedEvents: boolean
  }
  flow: {
    usesRegistry: boolean
    usesQuickOpsPluginId: boolean
    deliveryHandlerCount: number
    singleDeliveryHandler: boolean
  }
  sdk: {
    expectedMethods: string[]
    transportSdkMethods: string[]
    pluginSdkMethods: string[]
    pluginRuntimeMethods: string[]
    transportSdkUsesTypedEvents: boolean
    pluginSdkUsesTypedEvents: boolean
    pluginRuntimeUsesTypedEvents: boolean
    exposesForbiddenExecutionMethods: boolean
    forbiddenExecutionMethods: string[]
  }
  forbiddenSurfaceHits: Array<{
    file: 'module' | 'transport-sdk' | 'plugin-sdk' | 'plugin-runtime'
    pattern: string
    count: number
  }>
  gate: {
    passed: boolean
    failures: string[]
  }
}

function countOccurrences(source: string, pattern: string): number {
  if (!pattern) return 0
  return source.split(pattern).length - 1
}

function uniqSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort()
}

function extractTransportEvents(moduleSource: string): string[] {
  return Array.from(moduleSource.matchAll(/transport\.on\(\s*(QuickOpsEvents\.[\w.]+)/g)).map(
    (match) => match[1]
  )
}

function extractSdkMethods(source: string, interfaceName: string): string[] {
  const interfaceMatch = source.match(
    new RegExp(`export\\s+interface\\s+${interfaceName}\\s*\\{([\\s\\S]*?)\\n\\}`)
  )
  if (!interfaceMatch?.[1]) return []

  return interfaceMatch[1].split('\n').flatMap((line) => {
    const match = line.match(/^ {2}([A-Za-z]\w*)\s*:/)
    return match?.[1] ? [match[1]] : []
  })
}

function extractPluginRuntimeQuickOpsBlock(source: string): string {
  const startIndex = source.indexOf('const quickOps = {')
  if (startIndex < 0) return ''

  const firstBraceIndex = source.indexOf('{', startIndex)
  if (firstBraceIndex < 0) return ''

  let depth = 0
  for (let index = firstBraceIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(firstBraceIndex + 1, index)
    }
  }

  return ''
}

function extractPluginRuntimeQuickOpsMethods(source: string): string[] {
  const block = extractPluginRuntimeQuickOpsBlock(source)
  if (!block) return []

  return block.split('\n').flatMap((line) => {
    const match = line.match(/^ {6}([A-Za-z]\w*)\s*:/)
    return match?.[1] ? [match[1]] : []
  })
}

function extractPluginRuntimeQuickOpsEvents(source: string): string[] {
  const block = extractPluginRuntimeQuickOpsBlock(source)
  if (!block) return []

  return Array.from(block.matchAll(/transport\.invoke\(\s*(QuickOpsEvents\.[\w.]+)/g)).map(
    (match) => match[1]
  )
}

function collectForbiddenSurfaceHits(
  moduleSource: string,
  transportSdkSource: string,
  pluginSdkSource: string,
  pluginRuntimeSource: string
): QuickOpsSurfaceAuditResult['forbiddenSurfaceHits'] {
  const sources = [
    ['module', moduleSource],
    ['transport-sdk', transportSdkSource],
    ['plugin-sdk', pluginSdkSource],
    ['plugin-runtime', extractPluginRuntimeQuickOpsBlock(pluginRuntimeSource)]
  ] as const

  return sources.flatMap(([file, source]) =>
    FORBIDDEN_PUBLIC_SURFACE_PATTERNS.flatMap((pattern) => {
      const count = countOccurrences(source, pattern)
      return count > 0 ? [{ file, pattern, count }] : []
    })
  )
}

function hasOnlyExpectedItems(actual: string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((item, index) => item === expected[index])
  )
}

function sdkUsesOnlyTypedEvents(source: string): boolean {
  return (
    source.includes('QuickOpsEvents') &&
    !FORBIDDEN_PUBLIC_SURFACE_PATTERNS.some((pattern) => source.includes(`'${pattern}'`)) &&
    !FORBIDDEN_PUBLIC_SURFACE_PATTERNS.some((pattern) => source.includes(`"${pattern}"`))
  )
}

function pluginRuntimeUsesOnlyTypedEvents(source: string): boolean {
  const events = extractPluginRuntimeQuickOpsEvents(source)
  return (
    hasOnlyExpectedItems(events, QUICK_OPS_SURFACE_AUDIT_EXPECTED_TRANSPORT_EVENTS) &&
    sdkUsesOnlyTypedEvents(extractPluginRuntimeQuickOpsBlock(source))
  )
}

export function createQuickOpsSurfaceAudit(
  input: QuickOpsSurfaceAuditSourceInput
): QuickOpsSurfaceAuditResult {
  const registeredEvents = extractTransportEvents(input.moduleSource)
  const transportSdkMethods = extractSdkMethods(input.transportSdkSource, 'QuickOpsSdk')
  const pluginSdkMethods = extractSdkMethods(input.pluginSdkSource, 'QuickOpsSDK')
  const pluginRuntimeMethods = extractPluginRuntimeQuickOpsMethods(input.pluginRuntimeSource)
  const forbiddenExecutionMethods = uniqSorted(
    [...transportSdkMethods, ...pluginSdkMethods, ...pluginRuntimeMethods].filter((method) =>
      FORBIDDEN_SDK_METHOD_NAMES.includes(method as (typeof FORBIDDEN_SDK_METHOD_NAMES)[number])
    )
  )
  const forbiddenSurfaceHits = collectForbiddenSurfaceHits(
    input.moduleSource,
    input.transportSdkSource,
    input.pluginSdkSource,
    input.pluginRuntimeSource
  )
  const deliveryHandlerCount = countOccurrences(
    input.moduleSource,
    'flowBus.registerDeliveryHandler('
  )

  const result: QuickOpsSurfaceAuditResult = {
    schema: QUICK_OPS_SURFACE_AUDIT_SCHEMA,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    transport: {
      expectedEvents: [...QUICK_OPS_SURFACE_AUDIT_EXPECTED_TRANSPORT_EVENTS],
      registeredEvents,
      onlyExpectedTypedEvents: hasOnlyExpectedItems(
        registeredEvents,
        QUICK_OPS_SURFACE_AUDIT_EXPECTED_TRANSPORT_EVENTS
      )
    },
    flow: {
      usesRegistry: input.moduleSource.includes('flowTargetRegistry.registerTarget('),
      usesQuickOpsPluginId: input.moduleSource.includes(
        'flowTargetRegistry.registerTarget(QUICK_OPS_FLOW_PLUGIN_ID'
      ),
      deliveryHandlerCount,
      singleDeliveryHandler: deliveryHandlerCount === 1
    },
    sdk: {
      expectedMethods: [...QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS],
      transportSdkMethods,
      pluginSdkMethods,
      pluginRuntimeMethods,
      transportSdkUsesTypedEvents: sdkUsesOnlyTypedEvents(input.transportSdkSource),
      pluginSdkUsesTypedEvents: sdkUsesOnlyTypedEvents(input.pluginSdkSource),
      pluginRuntimeUsesTypedEvents: pluginRuntimeUsesOnlyTypedEvents(input.pluginRuntimeSource),
      exposesForbiddenExecutionMethods: forbiddenExecutionMethods.length > 0,
      forbiddenExecutionMethods
    },
    forbiddenSurfaceHits,
    gate: {
      passed: false,
      failures: []
    }
  }

  const failures: string[] = []
  if (!result.transport.onlyExpectedTypedEvents) {
    failures.push('QuickOpsModule transport handlers do not match expected typed events')
  }
  if (!result.flow.usesRegistry || !result.flow.usesQuickOpsPluginId) {
    failures.push('QuickOps Flow targets are not registered through the quickops registry path')
  }
  if (!result.flow.singleDeliveryHandler) {
    failures.push('QuickOps Flow delivery handler count is not exactly one')
  }
  if (
    !hasOnlyExpectedItems(
      result.sdk.transportSdkMethods,
      QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS
    )
  ) {
    failures.push('Transport QuickOps SDK methods do not match the read-only facade contract')
  }
  if (
    !hasOnlyExpectedItems(result.sdk.pluginSdkMethods, QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS)
  ) {
    failures.push('Plugin QuickOps SDK methods do not match the read-only facade contract')
  }
  if (
    !hasOnlyExpectedItems(
      result.sdk.pluginRuntimeMethods,
      QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS
    )
  ) {
    failures.push('Plugin runtime QuickOps facade methods do not match the read-only contract')
  }
  if (
    !result.sdk.transportSdkUsesTypedEvents ||
    !result.sdk.pluginSdkUsesTypedEvents ||
    !result.sdk.pluginRuntimeUsesTypedEvents
  ) {
    failures.push('QuickOps SDK facade does not exclusively use typed QuickOpsEvents')
  }
  if (result.sdk.exposesForbiddenExecutionMethods) {
    failures.push(
      `QuickOps SDK facade exposes forbidden execution methods: ${result.sdk.forbiddenExecutionMethods.join(', ')}`
    )
  }
  if (result.forbiddenSurfaceHits.length > 0) {
    failures.push('QuickOps public surface contains forbidden raw channel patterns')
  }

  result.gate = {
    passed: failures.length === 0,
    failures
  }
  return result
}

export async function createQuickOpsSurfaceAuditFromFiles(
  input: QuickOpsSurfaceAuditFileInput
): Promise<QuickOpsSurfaceAuditResult> {
  const repoRoot = path.resolve(input.repoRoot)
  const modulePath = input.modulePath ?? 'apps/core-app/src/main/modules/quick-ops/index.ts'
  const transportSdkPath =
    input.transportSdkPath ?? 'packages/utils/transport/sdk/domains/quick-ops.ts'
  const pluginSdkPath = input.pluginSdkPath ?? 'packages/utils/plugin/sdk/quick-ops.ts'
  const pluginRuntimePath =
    input.pluginRuntimePath ?? 'apps/core-app/src/main/modules/plugin/plugin.ts'

  const [moduleSource, transportSdkSource, pluginSdkSource, pluginRuntimeSource] =
    await Promise.all([
      readFile(path.resolve(repoRoot, modulePath), 'utf8'),
      readFile(path.resolve(repoRoot, transportSdkPath), 'utf8'),
      readFile(path.resolve(repoRoot, pluginSdkPath), 'utf8'),
      readFile(path.resolve(repoRoot, pluginRuntimePath), 'utf8')
    ])

  return createQuickOpsSurfaceAudit({
    moduleSource,
    transportSdkSource,
    pluginSdkSource,
    pluginRuntimeSource
  })
}
