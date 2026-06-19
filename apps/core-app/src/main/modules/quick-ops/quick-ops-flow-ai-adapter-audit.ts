import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const QUICK_OPS_FLOW_AI_ADAPTER_AUDIT_SCHEMA = 'quickops-flow-ai-adapter-audit/v1'

export const QUICK_OPS_FLOW_AI_EXPECTED_TARGETS = [
  'capabilities',
  'sessions',
  'stop-all-sessions',
  'system-info',
  'tuff-diagnostics',
  'disk-space',
  'directory-usage',
  'network-status',
  'battery-status',
  'system-proxy',
  'public-ip',
  'query-local-ip',
  'port-status',
  'dns-query',
  'file-hash',
  'file-base64',
  'recent-download',
  'common-directory',
  'path-format',
  'temp-text-file',
  'temp-directory',
  'keep-awake',
  'stop-keep-awake',
  'system-awake',
  'stop-system-awake',
  'start-timer',
  'pause-timer',
  'resume-timer',
  'stop-timer',
  'start-pomodoro',
  'pause-pomodoro',
  'resume-pomodoro',
  'stop-pomodoro',
  'clean-screen',
  'stop-clean-screen',
  'start-stopwatch',
  'pause-stopwatch',
  'resume-stopwatch',
  'lap-stopwatch',
  'reset-stopwatch',
  'show-notification',
  'copy-to-clipboard',
  'format-text',
  'open-folder'
] as const

export const QUICK_OPS_FLOW_AI_EXPECTED_CONFIRM_TARGETS = [
  'stop-all-sessions',
  'public-ip',
  'temp-text-file',
  'temp-directory',
  'keep-awake',
  'system-awake',
  'start-timer',
  'start-pomodoro',
  'clean-screen',
  'start-stopwatch',
  'show-notification',
  'copy-to-clipboard',
  'open-folder'
] as const

const EXPECTED_POLICY_REASONS = [
  'stateful-tools-disabled-by-policy',
  'network-tools-disabled-by-policy',
  'file-tools-disabled-by-policy',
  'system-tools-disabled-by-policy',
  'developer-tools-disabled-by-policy'
] as const

export interface QuickOpsFlowAiAdapterAuditFileInput {
  repoRoot: string
  modulePath?: string
  flowBusPath?: string
  flowSelectorPath?: string
  aiPaths?: string[]
}

export interface QuickOpsFlowAiAdapterAuditSourceInput {
  moduleSource: string
  flowBusSource: string
  flowSelectorSource: string
  aiSources: Array<{ path: string; source: string }>
  generatedAt?: string
}

export interface QuickOpsFlowAiAdapterAuditResult {
  schema: typeof QUICK_OPS_FLOW_AI_ADAPTER_AUDIT_SCHEMA
  generatedAt: string
  flow: {
    expectedTargets: string[]
    registeredTargets: string[]
    allTargetsRegistered: boolean
    requireConfirmTargets: string[]
    expectedRequireConfirmTargets: string[]
    requireConfirmMatchesExpected: boolean
    structuredDispatchCoverage: {
      readOnly: boolean
      stateful: boolean
      fileWriting: boolean
      notification: boolean
      clipboard: boolean
      folderOpen: boolean
    }
    policyBlockedReasons: string[]
    coversPolicyBlockedAck: boolean
    recordsAuditWithoutPayloadValues: boolean
    redactsClipboardAck: boolean
    exposesDegradedAck: boolean
  }
  confirmation: {
    flowBusRequiresOneTimeToken: boolean
    flowBusConsumesConfirmationToken: boolean
    selectorRequestsConfirmationToken: boolean
    selectorSeparatesConfirmationFromConsent: boolean
  }
  ai: {
    hasNaturalLanguageAdapter: boolean
    adapterSignals: string[]
    linksRequestTargetConfirmationResult: boolean
    blocksHighRiskWithoutConfirmation: boolean
    hasRuntimeDispatchBridge: boolean
  }
  gate: {
    passed: boolean
    failures: string[]
  }
}

function uniqSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort()
}

function extractStringConstValue(source: string, constName: string): string | null {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*'([^']+)'`))
  return match?.[1] ?? null
}

function extractTargetConstNames(source: string): string[] {
  const match = source.match(
    /const QUICK_OPS_ALL_FLOW_TARGETS:\s*FlowTarget\[\]\s*=\s*\[([\s\S]*?)\n\]/
  )
  if (!match?.[1]) return []

  return match[1].split('\n').flatMap((line) => {
    const targetMatch = line.match(/\b(QUICK_OPS_[A-Z0-9_]+_FLOW_TARGET)\b/)
    return targetMatch?.[1] ? [targetMatch[1]] : []
  })
}

function extractRegisteredTargets(source: string): string[] {
  return extractTargetConstNames(source)
    .map((targetConstName) => {
      const idConstName = targetConstName.replace(/_FLOW_TARGET$/, '_FLOW_TARGET_ID')
      return extractStringConstValue(source, idConstName)
    })
    .filter((value): value is string => Boolean(value))
}

function extractRequireConfirmTargets(source: string): string[] {
  return extractTargetConstNames(source)
    .filter((targetConstName) => {
      const targetDeclaration = source.match(
        new RegExp(`const\\s+${targetConstName}:\\s*FlowTarget\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`)
      )
      return targetDeclaration?.[1]?.includes('requireConfirm: true') === true
    })
    .map((targetConstName) => {
      const idConstName = targetConstName.replace(/_FLOW_TARGET$/, '_FLOW_TARGET_ID')
      return extractStringConstValue(source, idConstName)
    })
    .filter((value): value is string => Boolean(value))
}

function hasExactStringArray(value: readonly string[], expected: readonly string[]): boolean {
  return value.length === expected.length && value.every((item, index) => item === expected[index])
}

function hasSameStringSet(value: readonly string[], expected: readonly string[]): boolean {
  const actualSet = new Set(value)
  return value.length === expected.length && expected.every((item) => actualSet.has(item))
}

function collectPolicyReasons(source: string): string[] {
  return uniqSorted(
    Array.from(source.matchAll(/const QUICK_OPS_[A-Z_]+_POLICY_REASON = '([^']+)'/g)).map(
      (match) => match[1]
    )
  )
}

function hasSource(
  aiSources: Array<{ path: string; source: string }>,
  pathSuffix: string
): boolean {
  return aiSources.some(({ path: sourcePath }) => sourcePath.endsWith(pathSuffix))
}

function sourceIncludes(
  aiSources: Array<{ path: string; source: string }>,
  pathSuffix: string,
  text: string
): boolean {
  return aiSources.some(
    ({ path: sourcePath, source }) => sourcePath.endsWith(pathSuffix) && source.includes(text)
  )
}

function detectAiAdapterSignals(aiSources: Array<{ path: string; source: string }>): string[] {
  const signals: string[] = []
  if (
    sourceIncludes(
      aiSources,
      'quick-ops-natural-language-adapter.ts',
      'resolveQuickOpsNaturalLanguageRequest'
    )
  ) {
    signals.push(
      'apps/core-app/src/main/modules/quick-ops/quick-ops-natural-language-adapter.ts:resolver'
    )
  }
  if (
    sourceIncludes(
      aiSources,
      'quick-ops-natural-language-adapter.test.ts',
      'QuickOps natural-language adapter contract'
    )
  ) {
    signals.push(
      'apps/core-app/src/main/modules/quick-ops/quick-ops-natural-language-adapter.test.ts:contract'
    )
  }
  return signals
}

function hasNaturalLanguageAdapterContract(
  aiSources: Array<{ path: string; source: string }>
): boolean {
  return (
    hasSource(aiSources, 'quick-ops-natural-language-adapter.ts') &&
    sourceIncludes(
      aiSources,
      'quick-ops-natural-language-adapter.ts',
      'resolveQuickOpsNaturalLanguageRequest'
    ) &&
    sourceIncludes(
      aiSources,
      'quick-ops-natural-language-adapter.ts',
      'preferredTarget: targetId'
    ) &&
    sourceIncludes(
      aiSources,
      'quick-ops-natural-language-adapter.ts',
      'runtimeDispatchBridge: false'
    )
  )
}

function linksRequestTargetConfirmationResult(
  aiSources: Array<{ path: string; source: string }>
): boolean {
  return (
    sourceIncludes(aiSources, 'quick-ops-natural-language-adapter.ts', 'requestHash') &&
    sourceIncludes(aiSources, 'quick-ops-natural-language-adapter.ts', 'targetId') &&
    sourceIncludes(aiSources, 'quick-ops-natural-language-adapter.ts', 'confirmation') &&
    sourceIncludes(aiSources, 'quick-ops-natural-language-adapter.ts', 'result') &&
    sourceIncludes(aiSources, 'quick-ops-natural-language-adapter.test.ts', 'payloadKeys') &&
    sourceIncludes(
      aiSources,
      'quick-ops-natural-language-adapter.test.ts',
      'sensitivePayloadRedacted'
    )
  )
}

function blocksHighRiskWithoutConfirmation(
  aiSources: Array<{ path: string; source: string }>
): boolean {
  return (
    sourceIncludes(aiSources, 'quick-ops-natural-language-adapter.ts', 'high-risk-blocked') &&
    sourceIncludes(aiSources, 'quick-ops-natural-language-adapter.ts', "confirmation: 'blocked'") &&
    sourceIncludes(aiSources, 'quick-ops-natural-language-adapter.test.ts', 'kill port 3000') &&
    sourceIncludes(
      aiSources,
      'quick-ops-natural-language-adapter.test.ts',
      'dispatchOptions: undefined'
    )
  )
}

function hasRuntimeDispatchBridge(aiSources: Array<{ path: string; source: string }>): boolean {
  return aiSources.some(
    ({ source }) =>
      source.includes('resolveQuickOpsNaturalLanguageRequest') &&
      source.includes('flowBus.dispatch') &&
      source.includes('confirmationToken')
  )
}

export function createQuickOpsFlowAiAdapterAudit(
  input: QuickOpsFlowAiAdapterAuditSourceInput
): QuickOpsFlowAiAdapterAuditResult {
  const registeredTargets = extractRegisteredTargets(input.moduleSource)
  const requireConfirmTargets = extractRequireConfirmTargets(input.moduleSource)
  const policyBlockedReasons = collectPolicyReasons(input.moduleSource)
  const aiAdapterSignals = detectAiAdapterSignals(input.aiSources)
  const hasAdapterContract = hasNaturalLanguageAdapterContract(input.aiSources)

  const result: QuickOpsFlowAiAdapterAuditResult = {
    schema: QUICK_OPS_FLOW_AI_ADAPTER_AUDIT_SCHEMA,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    flow: {
      expectedTargets: [...QUICK_OPS_FLOW_AI_EXPECTED_TARGETS],
      registeredTargets,
      allTargetsRegistered: hasExactStringArray(
        registeredTargets,
        QUICK_OPS_FLOW_AI_EXPECTED_TARGETS
      ),
      requireConfirmTargets,
      expectedRequireConfirmTargets: [...QUICK_OPS_FLOW_AI_EXPECTED_CONFIRM_TARGETS],
      requireConfirmMatchesExpected: hasExactStringArray(
        requireConfirmTargets,
        QUICK_OPS_FLOW_AI_EXPECTED_CONFIRM_TARGETS
      ),
      structuredDispatchCoverage: {
        readOnly:
          registeredTargets.includes('system-info') && registeredTargets.includes('dns-query'),
        stateful:
          registeredTargets.includes('keep-awake') && registeredTargets.includes('start-timer'),
        fileWriting:
          registeredTargets.includes('temp-text-file') &&
          registeredTargets.includes('temp-directory'),
        notification: registeredTargets.includes('show-notification'),
        clipboard: registeredTargets.includes('copy-to-clipboard'),
        folderOpen: registeredTargets.includes('open-folder')
      },
      policyBlockedReasons,
      coversPolicyBlockedAck:
        input.moduleSource.includes('quickops.policyBlocked') &&
        input.moduleSource.includes('blocked: true'),
      recordsAuditWithoutPayloadValues:
        input.moduleSource.includes('payloadKeys: getFlowPayloadKeys(session)') &&
        input.moduleSource.includes('Object.keys(data).sort()') &&
        !input.moduleSource.includes('payloadValues'),
      redactsClipboardAck:
        input.moduleSource.includes(
          'session.targetId === QUICK_OPS_COPY_TO_CLIPBOARD_FLOW_TARGET_ID'
        ) &&
        input.moduleSource.includes('charCount: payload.text.length') &&
        input.moduleSource.includes('truncated: payload.truncated'),
      exposesDegradedAck:
        input.moduleSource.includes("state: 'degraded'") &&
        input.moduleSource.includes('degradedReason')
    },
    confirmation: {
      flowBusRequiresOneTimeToken:
        input.flowBusSource.includes('targetInfo.requireConfirm') &&
        input.flowBusSource.includes('flow-confirmation-required'),
      flowBusConsumesConfirmationToken:
        input.flowBusSource.includes('consumeConfirmation') &&
        input.flowBusSource.includes('options.confirmationToken'),
      selectorRequestsConfirmationToken:
        input.flowSelectorSource.includes('handleConsent') &&
        input.flowSelectorSource.includes('FlowEvents.grantConsent') &&
        input.flowSelectorSource.includes('confirmationToken'),
      selectorSeparatesConfirmationFromConsent:
        input.flowSelectorSource.includes('consentRequiresExecutionConfirmation') &&
        input.flowSelectorSource.includes('requiresConfirmation')
    },
    ai: {
      hasNaturalLanguageAdapter: hasAdapterContract,
      adapterSignals: aiAdapterSignals,
      linksRequestTargetConfirmationResult: linksRequestTargetConfirmationResult(input.aiSources),
      blocksHighRiskWithoutConfirmation: blocksHighRiskWithoutConfirmation(input.aiSources),
      hasRuntimeDispatchBridge: hasRuntimeDispatchBridge(input.aiSources)
    },
    gate: {
      passed: false,
      failures: []
    }
  }

  const failures: string[] = []
  if (!result.flow.allTargetsRegistered) {
    failures.push('QuickOps Flow target registry does not match expected target catalog')
  }
  if (!result.flow.requireConfirmMatchesExpected) {
    failures.push('QuickOps requireConfirm target set does not match the confirmation model')
  }
  if (!Object.values(result.flow.structuredDispatchCoverage).every(Boolean)) {
    failures.push('QuickOps Flow structured dispatch coverage is incomplete')
  }
  if (!hasSameStringSet(result.flow.policyBlockedReasons, EXPECTED_POLICY_REASONS)) {
    failures.push('QuickOps policy blocked reasons do not match expected local policy categories')
  }
  if (!result.flow.coversPolicyBlockedAck) {
    failures.push('QuickOps Flow policy blocked ACK evidence is missing')
  }
  if (!result.flow.recordsAuditWithoutPayloadValues) {
    failures.push('QuickOps Flow audit redaction evidence is missing')
  }
  if (!result.flow.redactsClipboardAck) {
    failures.push('QuickOps clipboard Flow ACK redaction evidence is missing')
  }
  if (!result.flow.exposesDegradedAck) {
    failures.push('QuickOps degraded ACK evidence is missing')
  }
  if (
    !result.confirmation.flowBusRequiresOneTimeToken ||
    !result.confirmation.flowBusConsumesConfirmationToken ||
    !result.confirmation.selectorRequestsConfirmationToken ||
    !result.confirmation.selectorSeparatesConfirmationFromConsent
  ) {
    failures.push('QuickOps Flow confirmation evidence is incomplete')
  }
  if (!result.ai.hasNaturalLanguageAdapter) {
    failures.push('QuickOps AI natural-language adapter evidence is missing')
  }
  if (!result.ai.linksRequestTargetConfirmationResult) {
    failures.push('QuickOps AI trace does not link request, target, confirmation, and result')
  }
  if (!result.ai.blocksHighRiskWithoutConfirmation) {
    failures.push('QuickOps AI high-risk blocking evidence is missing')
  }
  if (!result.ai.hasRuntimeDispatchBridge) {
    failures.push('QuickOps AI runtime dispatch bridge evidence is missing')
  }

  result.gate = {
    passed: failures.length === 0,
    failures
  }
  return result
}

export async function createQuickOpsFlowAiAdapterAuditFromFiles(
  input: QuickOpsFlowAiAdapterAuditFileInput
): Promise<QuickOpsFlowAiAdapterAuditResult> {
  const repoRoot = path.resolve(input.repoRoot)
  const modulePath = input.modulePath ?? 'apps/core-app/src/main/modules/quick-ops/index.ts'
  const flowBusPath = input.flowBusPath ?? 'apps/core-app/src/main/modules/flow-bus/flow-bus.ts'
  const flowSelectorPath =
    input.flowSelectorPath ?? 'apps/core-app/src/renderer/src/components/flow/FlowSelector.vue'
  const aiPaths = input.aiPaths ?? [
    'apps/core-app/src/main/modules/quick-ops/quick-ops-natural-language-adapter.ts',
    'apps/core-app/src/main/modules/quick-ops/quick-ops-natural-language-adapter.test.ts',
    'apps/core-app/src/main/modules/ai/intelligence-config.ts',
    'apps/core-app/src/main/modules/ai/intelligence-sdk.ts',
    'apps/nexus/server/utils/intelligenceAgentGraphRunner.ts',
    'apps/nexus/server/utils/tuffIntelligenceLabService.ts'
  ]

  const [moduleSource, flowBusSource, flowSelectorSource, ...aiSources] = await Promise.all([
    readFile(path.resolve(repoRoot, modulePath), 'utf8'),
    readFile(path.resolve(repoRoot, flowBusPath), 'utf8'),
    readFile(path.resolve(repoRoot, flowSelectorPath), 'utf8'),
    ...aiPaths.map((aiPath) => readFile(path.resolve(repoRoot, aiPath), 'utf8'))
  ])

  return createQuickOpsFlowAiAdapterAudit({
    moduleSource,
    flowBusSource,
    flowSelectorSource,
    aiSources: aiPaths.map((aiPath, index) => ({
      path: aiPath,
      source: aiSources[index]
    }))
  })
}
