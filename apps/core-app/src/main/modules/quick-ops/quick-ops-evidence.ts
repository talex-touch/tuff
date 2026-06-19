import {
  QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS,
  QUICK_OPS_SURFACE_AUDIT_EXPECTED_TRANSPORT_EVENTS,
  QUICK_OPS_SURFACE_AUDIT_SCHEMA
} from './quick-ops-surface-audit'
import {
  QUICK_OPS_FLOW_AI_ADAPTER_AUDIT_SCHEMA,
  QUICK_OPS_FLOW_AI_EXPECTED_CONFIRM_TARGETS,
  QUICK_OPS_FLOW_AI_EXPECTED_TARGETS
} from './quick-ops-flow-ai-adapter-audit'

export const QUICK_OPS_EVIDENCE_SCHEMA = 'quickops-evidence/v1'
export const QUICK_OPS_PACKAGED_SESSION_CLEANUP_SCHEMA = 'quickops-packaged-session-cleanup/v1'
export const QUICK_OPS_PLATFORM_READONLY_SCHEMA = 'quickops-platform-readonly/v1'
export const QUICK_OPS_FILES_AND_TEMP_SCHEMA = 'quickops-files-and-temp/v1'
export const QUICK_OPS_CONFIRMATION_POLICY_SCHEMA = 'quickops-confirmation-policy/v1'

const RAW_IPC_PREFIX = '@'
const QUICK_OPS_NO_RAW_CHANNEL_EVIDENCE =
  `No QuickOps public path uses regChannel, ipcMain, ${RAW_IPC_PREFIX}main-process-message, ` +
  `${RAW_IPC_PREFIX}plugin-process-message, or raw quick-ops string channels`
const QUICK_OPS_PACKAGED_SESSION_KINDS = [
  'keep-awake',
  'system-awake',
  'timer',
  'pomodoro',
  'stopwatch',
  'screen-clean'
] as const
const QUICK_OPS_PLATFORM_READONLY_PLATFORMS = ['macos', 'windows', 'linux'] as const
const QUICK_OPS_PLATFORM_READONLY_PROBES = [
  'localIp',
  'networkStatus',
  'portStatus',
  'dnsQuery',
  'systemProxy',
  'batteryStatus',
  'diskSpace',
  'directoryUsage'
] as const
const QUICK_OPS_PLATFORM_DEGRADED_REASON_PROBES = [
  'batteryStatus',
  'diskSpace',
  'directoryUsage'
] as const
const QUICK_OPS_COMMON_DIRECTORY_IDS = ['desktop', 'downloads', 'documents', 'app-data', 'logs']
const QUICK_OPS_CONFIRMATION_STATE_TARGETS = [
  'stop-all-sessions',
  'keep-awake',
  'system-awake',
  'start-timer',
  'start-pomodoro',
  'clean-screen',
  'start-stopwatch'
] as const
const QUICK_OPS_CONFIRMATION_FILE_TARGETS = [
  'temp-text-file',
  'temp-directory',
  'copy-to-clipboard',
  'open-folder'
] as const
const QUICK_OPS_POLICY_DISABLED_REASONS = [
  'stateful-tools-disabled-by-policy',
  'network-tools-disabled-by-policy',
  'file-tools-disabled-by-policy',
  'system-tools-disabled-by-policy',
  'developer-tools-disabled-by-policy',
  'high-risk-tools-disabled-by-policy'
] as const

export type QuickOpsEvidenceStatus = 'passed' | 'failed' | 'blocked' | 'pending'
export type QuickOpsEvidenceGroup =
  | 'runtime'
  | 'visual'
  | 'platform'
  | 'files'
  | 'safety'
  | 'automation'

export interface QuickOpsEvidenceCase {
  id: string
  group: QuickOpsEvidenceGroup
  title: string
  required: boolean
  requiresVisualArtifact: boolean
  collectionSteps: string[]
  requiredEvidence: string[]
  recommendedArtifacts: string[]
  blockedWhen: string[]
}

export interface QuickOpsEvidenceItem {
  id: string
  status: QuickOpsEvidenceStatus
  artifactPaths: string[]
  checkedEvidence: string[]
  notes?: string
  checkedAt?: string
}

export interface QuickOpsEvidenceManifest {
  schema: typeof QUICK_OPS_EVIDENCE_SCHEMA
  generatedAt: string
  baselineVersion: string
  verification?: {
    recommendedCommand?: string
  }
  cases: QuickOpsEvidenceItem[]
}

export interface QuickOpsEvidenceGateOptions {
  requireAllPassed?: boolean
  requireArtifactPaths?: boolean
  requireVisualArtifacts?: boolean
  requireCheckedEvidence?: boolean
}

export interface QuickOpsEvidenceGate {
  passed: boolean
  failures: string[]
}

export interface QuickOpsEvidenceArtifactContent {
  path: string
  content: string
}

export const QUICK_OPS_EVIDENCE_CASES: readonly QuickOpsEvidenceCase[] = [
  {
    id: 'quickops-packaged-session-cleanup',
    group: 'runtime',
    title: 'Packaged session cleanup and quit',
    required: true,
    requiresVisualArtifact: false,
    collectionSteps: [
      'Launch the current packaged CoreApp build with an isolated userData profile.',
      'Start keep-awake, system-awake, timer, pomodoro, stopwatch, and screen-clean sessions where supported.',
      'Quit the packaged app and attach a quickops-packaged-session-cleanup/v1 JSON artifact plus logs or probe output proving every native blocker, timer, and overlay is released.'
    ],
    requiredEvidence: [
      'Packaged cleanup artifact uses quickops-packaged-session-cleanup/v1 schema',
      'Packaged artifact version matches the manifest baseline',
      'Running QuickOps sessions are visible before quit',
      'App quit releases display and system power blockers',
      'App quit closes screen-clean overlay windows and clears timers/stopwatch runtime',
      'No BrowserWindow, timeout, or native blocker object is exposed in copied evidence'
    ],
    recommendedArtifacts: [
      'evidence/quickops/packaged-session-cleanup.json',
      'evidence/quickops/packaged-session-before-quit.json',
      'evidence/quickops/packaged-session-after-quit.json',
      'evidence/quickops/packaged-quit-log.txt'
    ],
    blockedWhen: [
      'Evidence is collected from dev mode only.',
      'The app is killed externally before the normal quit cleanup path runs.',
      'Runtime objects or raw userData paths are pasted into the evidence.'
    ]
  },
  {
    id: 'quickops-screen-clean-visual',
    group: 'visual',
    title: 'Screen clean and color test visual evidence',
    required: true,
    requiresVisualArtifact: true,
    collectionSteps: [
      'Start black, white, red, green, and blue screen-clean/color-test modes from CoreBox or Flow.',
      'Capture each overlay on at least one real display and record the long-press Esc recovery path.',
      'Capture the stopped or expired state after the overlay closes.'
    ],
    requiredEvidence: [
      'Black and white clean-screen overlays are full screen and hide the cursor',
      'Red, green, and blue color-test overlays render the requested solid color',
      'Countdown and long-press Esc hints are visible without external resources',
      'Stop, expiry, and destroy cleanup close every overlay window',
      'Artifacts are screenshots or recordings from a real desktop display'
    ],
    recommendedArtifacts: [
      'evidence/quickops/screen-clean-black.png',
      'evidence/quickops/screen-clean-white.png',
      'evidence/quickops/screen-color-red.png',
      'evidence/quickops/screen-color-green.png',
      'evidence/quickops/screen-color-blue.png',
      'evidence/quickops/screen-clean-stop.mp4'
    ],
    blockedWhen: [
      'Only data URL unit-test output is attached.',
      'The screenshot is cropped so fullscreen coverage cannot be verified.',
      'Recovery text overlaps or is clipped.'
    ]
  },
  {
    id: 'quickops-platform-readonly',
    group: 'platform',
    title: 'Platform read-only network and system evidence',
    required: true,
    requiresVisualArtifact: false,
    collectionSteps: [
      'Run local IP, port status, DNS query, network status, system proxy, battery status, system info, disk space, and directory usage on each supported platform.',
      'Record supported, degraded, and unsupported reasons without changing system settings.',
      'Attach one quickops-platform-readonly/v1 JSON artifact per platform plus redacted command/probe output and the copied QuickOps summary.'
    ],
    requiredEvidence: [
      'Platform artifacts use quickops-platform-readonly/v1 schema for macOS, Windows, and Linux',
      'macOS, Windows, and Linux results are separated by platform',
      'Local IP and network status do not perform external HTTP requests',
      'Port status reports available/occupied/degraded without executing kill commands',
      'DNS query uses the local resolver and records no system DNS mutation',
      'System proxy output redacts credentials',
      'Battery, disk, and directory usage failures surface degraded reasons instead of fake success'
    ],
    recommendedArtifacts: [
      'evidence/quickops/platform-macos.json',
      'evidence/quickops/platform-windows.json',
      'evidence/quickops/platform-linux.json'
    ],
    blockedWhen: [
      'One platform result is reused to claim another platform.',
      'Public IP or any external HTTP lookup is mixed into local-only evidence.',
      'A failed probe is recorded as passed without a degraded reason.'
    ]
  },
  {
    id: 'quickops-files-and-temp',
    group: 'files',
    title: 'Files, recent download, path, and temp workspace evidence',
    required: true,
    requiresVisualArtifact: false,
    collectionSteps: [
      'Run file hash/base64, recent download, common directory, path format, temp text file, and temp directory cases against real local files.',
      'Capture permission denied, missing file, directory input, large file, empty Downloads, duplicate target, and successful temp workspace cases.',
      'Attach one quickops-files-and-temp/v1 JSON artifact plus redacted paths and verify generated files stay under the Tuff QuickOps temp workspace.'
    ],
    requiredEvidence: [
      'Files/temp artifact uses quickops-files-and-temp/v1 schema',
      'File hash and file Base64 cover normal file, directory, missing path, permission failure, and size limit cases',
      'Recent download covers found, empty Downloads, permission failure, duplicate move target, and explicit absolute move target cases',
      'Common directory only resolves Desktop, Downloads, Documents, App Data, and Logs',
      'Path format returns raw, shell, file URL, and Windows/WSL variants without requiring file existence',
      'Temp text file and temp directory write only under the Tuff QuickOps temp workspace',
      'Artifacts redact Home/userData paths where summaries are copied'
    ],
    recommendedArtifacts: [
      'evidence/quickops/files-and-temp.json',
      'evidence/quickops/files-hash-base64.json',
      'evidence/quickops/files-recent-download.json',
      'evidence/quickops/files-temp-workspace.json',
      'evidence/quickops/files-path-format.json'
    ],
    blockedWhen: [
      'Temp files are written outside the Tuff QuickOps temp workspace.',
      'Recent download move overwrites an existing file.',
      'Evidence contains unredacted Home or userData paths where redaction is expected.'
    ]
  },
  {
    id: 'quickops-confirmation-and-policy',
    group: 'safety',
    title: 'Confirmation, high-risk boundary, and policy evidence',
    required: true,
    requiresVisualArtifact: true,
    collectionSteps: [
      'Trigger every requireConfirm QuickOps Flow target and capture the real confirmation UI before execution.',
      'Attempt high-risk operations such as true port kill or bulk file mutation and capture blocked/unavailable policy behavior.',
      'Attach a quickops-confirmation-policy/v1 JSON artifact with screenshot/recording references, and capture enterprise or admin policy disabled states when available.'
    ],
    requiredEvidence: [
      'Confirmation/policy artifact uses quickops-confirmation-policy/v1 schema',
      'Every requireConfirm target shows a real user confirmation surface before execution',
      'Confirm and cancel paths are both captured for at least one state action and one file action',
      'True port kill remains disabled or separately gated by high-risk policy',
      'Bulk rename, file cleanup, and long-term system settings changes remain unavailable by default',
      'Enterprise policy can disable QuickOps tools without removing diagnostic visibility'
    ],
    recommendedArtifacts: [
      'evidence/quickops/confirmation-policy.json',
      'evidence/quickops/confirm-keep-awake.png',
      'evidence/quickops/confirm-temp-file.png',
      'evidence/quickops/confirm-cancel.png',
      'evidence/quickops/policy-disabled.png'
    ],
    blockedWhen: [
      'Only Flow target metadata is attached instead of a real confirmation UI.',
      'A high-risk operation can execute without an explicit confirmation and policy gate.',
      'Policy disabled state hides degraded/diagnostic reason from the user.'
    ]
  },
  {
    id: 'quickops-sdk-transport-surface',
    group: 'safety',
    title: 'SDK and transport surface evidence',
    required: true,
    requiresVisualArtifact: false,
    collectionSteps: [
      'Run `pnpm -C "apps/core-app" run quickops:surface:audit -- --output "evidence/quickops/sdk-transport-surface.json" --strict`.',
      'Run a source audit across QuickOpsModule, QuickOps transport events, transport domain SDK, plugin SDK facade, and TouchPlugin runtime facade injection.',
      'Run the focused QuickOpsModule typed transport surface regression and transport domain SDK mapping tests.',
      'Attach a packaged or app-runtime probe showing plugin calls use quickOps/plugin.quickOps facade instead of private IPC.'
    ],
    requiredEvidence: [
      'QuickOpsModule registers only canonical QuickOpsEvents typed transport handlers',
      'QuickOps Flow targets are registered through flowTargetRegistry under the quickops plugin id',
      'Exactly one quickops Flow delivery handler is registered for built-in QuickOps targets',
      'Plugin SDK QuickOps facade is bounded, policy-aware, and does not expose stateful or destructive execution helpers',
      'TouchPlugin runtime quickOps facade exposes the same bounded method set and invokes only QuickOpsEvents typed transport',
      QUICK_OPS_NO_RAW_CHANNEL_EVIDENCE,
      'Artifacts include the command output or probe trace used to establish the channel audit'
    ],
    recommendedArtifacts: [
      'evidence/quickops/sdk-transport-surface.json',
      'evidence/quickops/sdk-facade-audit.txt',
      'evidence/quickops/quickops-transport-tests.txt'
    ],
    blockedWhen: [
      'Only an allowlist is attached without current command output or runtime probe evidence.',
      'Plugin examples call private IPC or transport event strings directly.',
      'A stateful or high-risk QuickOps operation is exposed through the plugin SDK or TouchPlugin runtime facade.'
    ]
  },
  {
    id: 'quickops-flow-ai-adapter',
    group: 'automation',
    title: 'Flow and AI action adapter evidence',
    required: true,
    requiresVisualArtifact: true,
    collectionSteps: [
      'Run `pnpm -C "apps/core-app" run quickops:flow-ai:audit -- --output "evidence/quickops/flow-ai-adapter-audit.json"` and keep the JSON artifact attached.',
      'Run structured Flow dispatch for every QuickOps target and capture acknowledgments, degraded paths, and consent/confirmation behavior.',
      'Run AI natural-language QuickOps requests and capture target selection, parameter extraction, confirmation, execution, and error recovery.',
      'Capture logs or trace output proving no high-risk target is auto-executed from AI text without confirmation.'
    ],
    requiredEvidence: [
      'Structured Flow dispatch covers read-only, stateful, file-writing, notification, clipboard, and folder-open targets',
      'AI natural-language adapter maps user text to the intended QuickOps target and parameters',
      'AI requests that imply high-risk actions stop at confirmation or blocked policy state',
      'Degraded acknowledgments are visible and recoverable',
      'Trace output links request, selected target, confirmation state, and final result without leaking sensitive content'
    ],
    recommendedArtifacts: [
      'evidence/quickops/flow-ai-adapter-audit.json',
      'evidence/quickops/flow-targets.json',
      'evidence/quickops/ai-action-adapter.png',
      'evidence/quickops/ai-high-risk-blocked.png'
    ],
    blockedWhen: [
      'Only direct SDK/focused test output is attached.',
      'Natural-language AI execution skips target selection or confirmation evidence.',
      'Trace output leaks file contents, clipboard contents, or unredacted private paths.'
    ]
  }
] as const

function normalizeEvidenceDir(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '') || 'evidence/quickops'
}

function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function isVisualArtifactPath(value: string): boolean {
  return /\.(png|jpe?g|webp|gif|mp4|mov|webm)$/i.test(value.trim())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getRecord(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const child = value[key]
  return isRecord(child) ? child : null
}

function hasExactStringArray(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  )
}

function parseJsonRecord(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function collectSurfaceAuditArtifacts(
  artifacts: QuickOpsEvidenceArtifactContent[]
): Array<{ path: string; audit: Record<string, unknown> }> {
  return artifacts.flatMap((artifact) => {
    const audit = parseJsonRecord(artifact.content)
    if (audit?.schema !== QUICK_OPS_SURFACE_AUDIT_SCHEMA) return []
    return [{ path: artifact.path, audit }]
  })
}

function collectFlowAiAdapterAuditArtifacts(
  artifacts: QuickOpsEvidenceArtifactContent[]
): Array<{ path: string; audit: Record<string, unknown> }> {
  return artifacts.flatMap((artifact) => {
    const audit = parseJsonRecord(artifact.content)
    if (audit?.schema !== QUICK_OPS_FLOW_AI_ADAPTER_AUDIT_SCHEMA) return []
    return [{ path: artifact.path, audit }]
  })
}

function collectPackagedSessionCleanupArtifacts(
  artifacts: QuickOpsEvidenceArtifactContent[]
): Array<{ path: string; evidence: Record<string, unknown> }> {
  return artifacts.flatMap((artifact) => {
    const evidence = parseJsonRecord(artifact.content)
    if (evidence?.schema !== QUICK_OPS_PACKAGED_SESSION_CLEANUP_SCHEMA) return []
    return [{ path: artifact.path, evidence }]
  })
}

function collectPlatformReadonlyArtifacts(
  artifacts: QuickOpsEvidenceArtifactContent[]
): Array<{ path: string; evidence: Record<string, unknown> }> {
  return artifacts.flatMap((artifact) => {
    const evidence = parseJsonRecord(artifact.content)
    if (evidence?.schema !== QUICK_OPS_PLATFORM_READONLY_SCHEMA) return []
    return [{ path: artifact.path, evidence }]
  })
}

function collectFilesAndTempArtifacts(
  artifacts: QuickOpsEvidenceArtifactContent[]
): Array<{ path: string; evidence: Record<string, unknown> }> {
  return artifacts.flatMap((artifact) => {
    const evidence = parseJsonRecord(artifact.content)
    if (evidence?.schema !== QUICK_OPS_FILES_AND_TEMP_SCHEMA) return []
    return [{ path: artifact.path, evidence }]
  })
}

function collectConfirmationPolicyArtifacts(
  artifacts: QuickOpsEvidenceArtifactContent[]
): Array<{ path: string; evidence: Record<string, unknown> }> {
  return artifacts.flatMap((artifact) => {
    const evidence = parseJsonRecord(artifact.content)
    if (evidence?.schema !== QUICK_OPS_CONFIRMATION_POLICY_SCHEMA) return []
    return [{ path: artifact.path, evidence }]
  })
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function validatePackagedSessionCoverage(
  path: string,
  evidence: Record<string, unknown>
): string[] {
  const failures: string[] = []
  const sessionCoverage = getRecord(evidence, 'sessionCoverage')
  const beforeQuit = getRecord(evidence, 'beforeQuit')
  const prefix = `QuickOps packaged session cleanup artifact is invalid: ${path}`

  if (!sessionCoverage) {
    failures.push(`${prefix} -> sessionCoverage section is missing`)
    return failures
  }

  const startedKinds = getStringArray(sessionCoverage.startedKinds)
  const unsupportedKinds = getStringArray(sessionCoverage.unsupportedKinds)
  const coveredKinds = new Set([...startedKinds, ...unsupportedKinds])
  for (const kind of QUICK_OPS_PACKAGED_SESSION_KINDS) {
    if (!coveredKinds.has(kind)) {
      failures.push(`${prefix} -> session kind is neither started nor unsupported: ${kind}`)
    }
  }
  if (startedKinds.length === 0) {
    failures.push(`${prefix} -> no supported QuickOps session was started before quit`)
  }
  if (beforeQuit?.visible !== true) {
    failures.push(`${prefix} -> beforeQuit.visible is not true`)
  }
  const runningSessionCount = getNumber(beforeQuit?.runningSessionCount)
  if (runningSessionCount === null || runningSessionCount < startedKinds.length) {
    failures.push(`${prefix} -> beforeQuit.runningSessionCount is lower than started session count`)
  }

  return failures
}

function validatePackagedSessionCleanupArtifact(
  path: string,
  evidence: Record<string, unknown>
): string[] {
  const failures: string[] = []
  const packaged = getRecord(evidence, 'packaged')
  const quit = getRecord(evidence, 'quit')
  const afterQuit = getRecord(evidence, 'afterQuit')
  const redaction = getRecord(evidence, 'redaction')
  const gate = getRecord(evidence, 'gate')
  const prefix = `QuickOps packaged session cleanup artifact is invalid: ${path}`

  if (gate?.passed !== true) failures.push(`${prefix} -> gate.passed is not true`)
  if (!packaged) {
    failures.push(`${prefix} -> packaged section is missing`)
  } else {
    if (packaged.isPackaged !== true) {
      failures.push(`${prefix} -> packaged.isPackaged is not true`)
    }
    if (packaged.versionMatchesManifest !== true) {
      failures.push(`${prefix} -> packaged.versionMatchesManifest is not true`)
    }
    if (packaged.isolatedUserData !== true) {
      failures.push(`${prefix} -> packaged.isolatedUserData is not true`)
    }
  }

  if (!quit) {
    failures.push(`${prefix} -> quit section is missing`)
  } else {
    if (quit.normalQuit !== true) failures.push(`${prefix} -> quit.normalQuit is not true`)
    if (quit.externalKill !== false) failures.push(`${prefix} -> quit.externalKill is not false`)
  }

  failures.push(...validatePackagedSessionCoverage(path, evidence))

  if (!afterQuit) {
    failures.push(`${prefix} -> afterQuit section is missing`)
  } else {
    const runningSessionCount = getNumber(afterQuit.runningSessionCount)
    const overlayWindowCount = getNumber(afterQuit.overlayWindowCount)
    const activeTimerCount = getNumber(afterQuit.activeTimerCount)
    const activeStopwatchCount = getNumber(afterQuit.activeStopwatchCount)
    if (runningSessionCount !== 0) {
      failures.push(`${prefix} -> afterQuit.runningSessionCount is not 0`)
    }
    if (afterQuit.displayPowerBlockerActive !== false) {
      failures.push(`${prefix} -> afterQuit.displayPowerBlockerActive is not false`)
    }
    if (afterQuit.systemPowerBlockerActive !== false) {
      failures.push(`${prefix} -> afterQuit.systemPowerBlockerActive is not false`)
    }
    if (overlayWindowCount !== 0) {
      failures.push(`${prefix} -> afterQuit.overlayWindowCount is not 0`)
    }
    if (activeTimerCount !== 0) {
      failures.push(`${prefix} -> afterQuit.activeTimerCount is not 0`)
    }
    if (activeStopwatchCount !== 0) {
      failures.push(`${prefix} -> afterQuit.activeStopwatchCount is not 0`)
    }
  }

  if (!redaction) {
    failures.push(`${prefix} -> redaction section is missing`)
  } else {
    if (redaction.noRuntimeObjects !== true) {
      failures.push(`${prefix} -> redaction.noRuntimeObjects is not true`)
    }
    if (redaction.noRawUserDataPath !== true) {
      failures.push(`${prefix} -> redaction.noRawUserDataPath is not true`)
    }
  }

  return failures
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isSupportedPlatform(
  value: unknown
): value is (typeof QUICK_OPS_PLATFORM_READONLY_PLATFORMS)[number] {
  return (
    typeof value === 'string' &&
    QUICK_OPS_PLATFORM_READONLY_PLATFORMS.includes(
      value as (typeof QUICK_OPS_PLATFORM_READONLY_PLATFORMS)[number]
    )
  )
}

function validatePlatformReadonlyProbe(
  path: string,
  probeName: string,
  probe: Record<string, unknown> | null
): string[] {
  const prefix = `QuickOps platform readonly artifact is invalid: ${path}`
  if (!probe) return [`${prefix} -> probes.${probeName} section is missing`]

  const state = getString(probe.state)
  if (!state) return [`${prefix} -> probes.${probeName}.state is missing`]
  if (!['passed', 'degraded', 'unsupported'].includes(state)) {
    return [`${prefix} -> probes.${probeName}.state is invalid: ${state}`]
  }
  if (
    QUICK_OPS_PLATFORM_DEGRADED_REASON_PROBES.includes(
      probeName as (typeof QUICK_OPS_PLATFORM_DEGRADED_REASON_PROBES)[number]
    ) &&
    state !== 'passed' &&
    !getString(probe.reason)
  ) {
    return [`${prefix} -> probes.${probeName}.reason is required for ${state} evidence`]
  }
  if (probe.fakeSuccess === true) {
    return [`${prefix} -> probes.${probeName}.fakeSuccess must not be true`]
  }

  return []
}

function validatePlatformReadonlyArtifact(
  path: string,
  evidence: Record<string, unknown>
): string[] {
  const failures: string[] = []
  const portStatus = getRecord(evidence, 'portStatus')
  const dnsQuery = getRecord(evidence, 'dnsQuery')
  const systemProxy = getRecord(evidence, 'systemProxy')
  const probes = getRecord(evidence, 'probes')
  const redaction = getRecord(evidence, 'redaction')
  const gate = getRecord(evidence, 'gate')
  const prefix = `QuickOps platform readonly artifact is invalid: ${path}`

  if (gate?.passed !== true) failures.push(`${prefix} -> gate.passed is not true`)
  if (!isSupportedPlatform(evidence.platform)) {
    failures.push(`${prefix} -> platform is not one of macos/windows/linux`)
  }
  if (evidence.collectedFromCurrentPlatform !== true) {
    failures.push(`${prefix} -> collectedFromCurrentPlatform is not true`)
  }
  if (evidence.localNetworkOnly !== true) {
    failures.push(`${prefix} -> localNetworkOnly is not true`)
  }
  if (getNumber(evidence.externalHttpRequestCount) !== 0) {
    failures.push(`${prefix} -> externalHttpRequestCount is not 0`)
  }
  if (!portStatus) {
    failures.push(`${prefix} -> portStatus section is missing`)
  } else if (portStatus.executedKill !== false) {
    failures.push(`${prefix} -> portStatus.executedKill is not false`)
  }
  if (!dnsQuery) {
    failures.push(`${prefix} -> dnsQuery section is missing`)
  } else {
    if (dnsQuery.usesLocalResolver !== true) {
      failures.push(`${prefix} -> dnsQuery.usesLocalResolver is not true`)
    }
    if (dnsQuery.mutatedSystemDns !== false) {
      failures.push(`${prefix} -> dnsQuery.mutatedSystemDns is not false`)
    }
  }
  if (!systemProxy) {
    failures.push(`${prefix} -> systemProxy section is missing`)
  } else if (systemProxy.credentialsRedacted !== true) {
    failures.push(`${prefix} -> systemProxy.credentialsRedacted is not true`)
  }
  if (!probes) {
    failures.push(`${prefix} -> probes section is missing`)
  } else {
    for (const probeName of QUICK_OPS_PLATFORM_READONLY_PROBES) {
      failures.push(...validatePlatformReadonlyProbe(path, probeName, getRecord(probes, probeName)))
    }
  }
  if (!redaction) {
    failures.push(`${prefix} -> redaction section is missing`)
  } else {
    const redactionFields = ['noProxyCredentials', 'noRawHomePath', 'noRawUserDataPath'] as const
    for (const field of redactionFields) {
      if (redaction[field] !== true) failures.push(`${prefix} -> redaction.${field} is not true`)
    }
  }

  return failures
}

function validatePlatformReadonlyArtifactSet(
  artifacts: Array<{ path: string; evidence: Record<string, unknown> }>
): string[] {
  const failures: string[] = []
  const artifactsByPlatform = new Map<
    string,
    Array<{ path: string; evidence: Record<string, unknown> }>
  >()

  for (const artifact of artifacts) {
    const platform = isSupportedPlatform(artifact.evidence.platform)
      ? artifact.evidence.platform
      : String(artifact.evidence.platform)
    const current = artifactsByPlatform.get(platform) ?? []
    current.push(artifact)
    artifactsByPlatform.set(platform, current)
  }

  for (const platform of QUICK_OPS_PLATFORM_READONLY_PLATFORMS) {
    const platformArtifacts = artifactsByPlatform.get(platform) ?? []
    if (platformArtifacts.length === 0) {
      failures.push(`QuickOps platform readonly evidence is missing ${platform} artifact`)
    }
    if (platformArtifacts.length > 1) {
      failures.push(`QuickOps platform readonly evidence has duplicate ${platform} artifacts`)
    }
  }

  return failures
}

function validateExpectedState(
  path: string,
  probePath: string,
  probe: Record<string, unknown> | null,
  expectedStates: readonly string[],
  requireReason = false
): string[] {
  const prefix = `QuickOps files/temp artifact is invalid: ${path}`
  if (!probe) return [`${prefix} -> ${probePath} section is missing`]

  const state = getString(probe.state)
  if (!state || !expectedStates.includes(state)) {
    return [`${prefix} -> ${probePath}.state is not one of ${expectedStates.join('/')}`]
  }
  if (requireReason && !getString(probe.reason)) {
    return [`${prefix} -> ${probePath}.reason is required`]
  }
  if (probe.fakeSuccess === true) {
    return [`${prefix} -> ${probePath}.fakeSuccess must not be true`]
  }

  return []
}

function validateFilesAndTempArtifact(path: string, evidence: Record<string, unknown>): string[] {
  const failures: string[] = []
  const fileHash = getRecord(evidence, 'fileHash')
  const fileBase64 = getRecord(evidence, 'fileBase64')
  const recentDownload = getRecord(evidence, 'recentDownload')
  const commonDirectory = getRecord(evidence, 'commonDirectory')
  const pathFormat = getRecord(evidence, 'pathFormat')
  const tempWorkspace = getRecord(evidence, 'tempWorkspace')
  const redaction = getRecord(evidence, 'redaction')
  const gate = getRecord(evidence, 'gate')
  const prefix = `QuickOps files/temp artifact is invalid: ${path}`

  if (gate?.passed !== true) failures.push(`${prefix} -> gate.passed is not true`)

  if (!fileHash) {
    failures.push(`${prefix} -> fileHash section is missing`)
  } else {
    failures.push(
      ...validateExpectedState(path, 'fileHash.normalFile', getRecord(fileHash, 'normalFile'), [
        'passed',
        'hashed'
      ])
    )
    for (const caseName of ['directoryInput', 'missingPath', 'permissionFailure']) {
      failures.push(
        ...validateExpectedState(
          path,
          `fileHash.${caseName}`,
          getRecord(fileHash, caseName),
          ['degraded'],
          true
        )
      )
    }
    if (fileHash.noWrites !== true) failures.push(`${prefix} -> fileHash.noWrites is not true`)
  }

  if (!fileBase64) {
    failures.push(`${prefix} -> fileBase64 section is missing`)
  } else {
    failures.push(
      ...validateExpectedState(path, 'fileBase64.normalFile', getRecord(fileBase64, 'normalFile'), [
        'passed',
        'encoded'
      ])
    )
    for (const caseName of ['directoryInput', 'missingPath', 'permissionFailure', 'sizeLimit']) {
      failures.push(
        ...validateExpectedState(
          path,
          `fileBase64.${caseName}`,
          getRecord(fileBase64, caseName),
          ['degraded'],
          true
        )
      )
    }
    const booleanFields = ['noDecodeToTempFile', 'noRawBase64Payload'] as const
    for (const field of booleanFields) {
      if (fileBase64[field] !== true) failures.push(`${prefix} -> fileBase64.${field} is not true`)
    }
  }

  if (!recentDownload) {
    failures.push(`${prefix} -> recentDownload section is missing`)
  } else {
    failures.push(
      ...validateExpectedState(path, 'recentDownload.found', getRecord(recentDownload, 'found'), [
        'passed',
        'found'
      ])
    )
    for (const caseName of ['emptyDownloads', 'permissionFailure', 'duplicateMoveTarget']) {
      failures.push(
        ...validateExpectedState(
          path,
          `recentDownload.${caseName}`,
          getRecord(recentDownload, caseName),
          ['degraded'],
          true
        )
      )
    }
    const explicitMoveTarget = getRecord(recentDownload, 'explicitAbsoluteMoveTarget')
    failures.push(
      ...validateExpectedState(
        path,
        'recentDownload.explicitAbsoluteMoveTarget',
        explicitMoveTarget,
        ['passed', 'moved']
      )
    )
    if (explicitMoveTarget?.explicitAbsoluteTarget !== true) {
      failures.push(
        `${prefix} -> recentDownload.explicitAbsoluteMoveTarget.explicitAbsoluteTarget is not true`
      )
    }
    if (explicitMoveTarget?.overwriteExisting !== false) {
      failures.push(
        `${prefix} -> recentDownload.explicitAbsoluteMoveTarget.overwriteExisting is not false`
      )
    }
  }

  if (!commonDirectory) {
    failures.push(`${prefix} -> commonDirectory section is missing`)
  } else {
    if (!hasExactStringArray(commonDirectory.allowedIds, QUICK_OPS_COMMON_DIRECTORY_IDS)) {
      failures.push(
        `${prefix} -> commonDirectory.allowedIds do not match the allowed directory set`
      )
    }
    if (commonDirectory.noArbitraryPath !== true) {
      failures.push(`${prefix} -> commonDirectory.noArbitraryPath is not true`)
    }
    if (commonDirectory.rejectsUnsupported !== true) {
      failures.push(`${prefix} -> commonDirectory.rejectsUnsupported is not true`)
    }
  }

  if (!pathFormat) {
    failures.push(`${prefix} -> pathFormat section is missing`)
  } else {
    const booleanFields = [
      'raw',
      'shell',
      'fileUrl',
      'windowsWslVariants',
      'noExistenceRequired'
    ] as const
    for (const field of booleanFields) {
      if (pathFormat[field] !== true) failures.push(`${prefix} -> pathFormat.${field} is not true`)
    }
    if (pathFormat.openedPath !== false) {
      failures.push(`${prefix} -> pathFormat.openedPath is not false`)
    }
    if (pathFormat.wroteClipboard !== false) {
      failures.push(`${prefix} -> pathFormat.wroteClipboard is not false`)
    }
  }

  if (!tempWorkspace) {
    failures.push(`${prefix} -> tempWorkspace section is missing`)
  } else {
    if (tempWorkspace.rootUnderTuffQuickOpsTemp !== true) {
      failures.push(`${prefix} -> tempWorkspace.rootUnderTuffQuickOpsTemp is not true`)
    }
    if (tempWorkspace.noWriteOutsideWorkspace !== true) {
      failures.push(`${prefix} -> tempWorkspace.noWriteOutsideWorkspace is not true`)
    }
    for (const caseName of ['textFile', 'directory'] as const) {
      const tempCase = getRecord(tempWorkspace, caseName)
      failures.push(
        ...validateExpectedState(path, `tempWorkspace.${caseName}`, tempCase, ['created', 'passed'])
      )
      if (tempCase?.underWorkspace !== true) {
        failures.push(`${prefix} -> tempWorkspace.${caseName}.underWorkspace is not true`)
      }
      if (tempCase?.opened !== false) {
        failures.push(`${prefix} -> tempWorkspace.${caseName}.opened is not false`)
      }
      if (tempCase?.wroteClipboard !== false) {
        failures.push(`${prefix} -> tempWorkspace.${caseName}.wroteClipboard is not false`)
      }
    }
  }

  if (!redaction) {
    failures.push(`${prefix} -> redaction section is missing`)
  } else {
    const redactionFields = ['noRawHomePath', 'noRawUserDataPath', 'noFileContents'] as const
    for (const field of redactionFields) {
      if (redaction[field] !== true) failures.push(`${prefix} -> redaction.${field} is not true`)
    }
  }

  return failures
}

function getVisualArtifactRefs(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : []
}

function validateConfirmationActionEvidence(
  path: string,
  label: string,
  action: Record<string, unknown> | null,
  allowedTargets: readonly string[]
): string[] {
  const failures: string[] = []
  const prefix = `QuickOps confirmation/policy artifact is invalid: ${path}`
  const targetId = getString(action?.targetId)

  if (!action) return [`${prefix} -> confirmation.${label} section is missing`]
  if (!targetId || !allowedTargets.includes(targetId)) {
    failures.push(`${prefix} -> confirmation.${label}.targetId is not an expected target`)
  }

  const booleanFields = [
    'confirmCaptured',
    'cancelCaptured',
    'beforeExecution',
    'confirmationTokenIssuedOnConfirm',
    'noDispatchOnCancel'
  ] as const
  for (const field of booleanFields) {
    if (action[field] !== true) {
      failures.push(`${prefix} -> confirmation.${label}.${field} is not true`)
    }
  }

  return failures
}

function validateUnavailableOperation(
  path: string,
  label: string,
  operation: Record<string, unknown> | null
): string[] {
  const failures: string[] = []
  const prefix = `QuickOps confirmation/policy artifact is invalid: ${path}`

  if (!operation) return [`${prefix} -> highRisk.${label} section is missing`]
  if (operation.availableByDefault !== false) {
    failures.push(`${prefix} -> highRisk.${label}.availableByDefault is not false`)
  }
  if (operation.executed !== false) {
    failures.push(`${prefix} -> highRisk.${label}.executed is not false`)
  }
  if (!getString(operation.reason)) {
    failures.push(`${prefix} -> highRisk.${label}.reason is missing`)
  }

  return failures
}

function validateConfirmationPolicyArtifact(
  path: string,
  evidence: Record<string, unknown>
): string[] {
  const failures: string[] = []
  const confirmation = getRecord(evidence, 'confirmation')
  const highRisk = getRecord(evidence, 'highRisk')
  const policy = getRecord(evidence, 'policy')
  const redaction = getRecord(evidence, 'redaction')
  const gate = getRecord(evidence, 'gate')
  const prefix = `QuickOps confirmation/policy artifact is invalid: ${path}`

  if (gate?.passed !== true) failures.push(`${prefix} -> gate.passed is not true`)

  if (!confirmation) {
    failures.push(`${prefix} -> confirmation section is missing`)
  } else {
    if (
      !hasExactStringArray(
        confirmation.capturedRequireConfirmTargets,
        QUICK_OPS_FLOW_AI_EXPECTED_CONFIRM_TARGETS
      )
    ) {
      failures.push(`${prefix} -> confirmation.capturedRequireConfirmTargets do not match expected`)
    }
    const booleanFields = ['realUserSurface', 'beforeExecution', 'notMetadataOnly'] as const
    for (const field of booleanFields) {
      if (confirmation[field] !== true) {
        failures.push(`${prefix} -> confirmation.${field} is not true`)
      }
    }
    const visualArtifacts = getVisualArtifactRefs(confirmation.visualArtifacts)
    if (visualArtifacts.length === 0) {
      failures.push(`${prefix} -> confirmation.visualArtifacts are missing`)
    }
    for (const visualArtifact of visualArtifacts) {
      if (!isVisualArtifactPath(visualArtifact)) {
        failures.push(`${prefix} -> confirmation visual artifact is not visual: ${visualArtifact}`)
      }
    }
    failures.push(
      ...validateConfirmationActionEvidence(
        path,
        'stateAction',
        getRecord(confirmation, 'stateAction'),
        QUICK_OPS_CONFIRMATION_STATE_TARGETS
      ),
      ...validateConfirmationActionEvidence(
        path,
        'fileAction',
        getRecord(confirmation, 'fileAction'),
        QUICK_OPS_CONFIRMATION_FILE_TARGETS
      )
    )
  }

  if (!highRisk) {
    failures.push(`${prefix} -> highRisk section is missing`)
  } else {
    const portKill = getRecord(highRisk, 'truePortKill')
    if (!portKill) {
      failures.push(`${prefix} -> highRisk.truePortKill section is missing`)
    } else {
      if (portKill.executed !== false) {
        failures.push(`${prefix} -> highRisk.truePortKill.executed is not false`)
      }
      if (portKill.directExecutionAvailable !== false) {
        failures.push(`${prefix} -> highRisk.truePortKill.directExecutionAvailable is not false`)
      }
      if (portKill.copyOnlyCommand !== true && portKill.highRiskPolicyGate !== true) {
        failures.push(`${prefix} -> highRisk.truePortKill is neither copy-only nor policy-gated`)
      }
    }
    for (const operation of ['bulkRename', 'fileCleanup', 'longTermSystemSettings']) {
      failures.push(
        ...validateUnavailableOperation(path, operation, getRecord(highRisk, operation))
      )
    }
  }

  if (!policy) {
    failures.push(`${prefix} -> policy section is missing`)
  } else {
    if (policy.enterpriseOrAdminPolicyApplied !== true) {
      failures.push(`${prefix} -> policy.enterpriseOrAdminPolicyApplied is not true`)
    }
    if (!hasExactStringArray(policy.disabledReasons, QUICK_OPS_POLICY_DISABLED_REASONS)) {
      failures.push(`${prefix} -> policy.disabledReasons do not match expected reasons`)
    }
    if (policy.noToolExecutionWhenDisabled !== true) {
      failures.push(`${prefix} -> policy.noToolExecutionWhenDisabled is not true`)
    }
    const diagnosticVisibility = getRecord(policy, 'diagnosticVisibility')
    if (!diagnosticVisibility) {
      failures.push(`${prefix} -> policy.diagnosticVisibility section is missing`)
    } else {
      const visibilityFields = [
        'capabilitySummaryVisible',
        'degradedReasonsVisible',
        'readonlyDiagnosticsVisible'
      ] as const
      for (const field of visibilityFields) {
        if (diagnosticVisibility[field] !== true) {
          failures.push(`${prefix} -> policy.diagnosticVisibility.${field} is not true`)
        }
      }
    }
  }

  if (!redaction) {
    failures.push(`${prefix} -> redaction section is missing`)
  } else {
    const redactionFields = [
      'noPayloadValues',
      'noClipboardContents',
      'noFileContents',
      'noRawHomePath'
    ] as const
    for (const field of redactionFields) {
      if (redaction[field] !== true) failures.push(`${prefix} -> redaction.${field} is not true`)
    }
  }

  return failures
}

function validateSurfaceAuditArtifact(path: string, audit: Record<string, unknown>): string[] {
  const failures: string[] = []
  const transport = getRecord(audit, 'transport')
  const flow = getRecord(audit, 'flow')
  const sdk = getRecord(audit, 'sdk')
  const gate = getRecord(audit, 'gate')
  const forbiddenSurfaceHits = audit.forbiddenSurfaceHits
  const prefix = `QuickOps SDK/transport surface artifact is invalid: ${path}`

  if (gate?.passed !== true) failures.push(`${prefix} -> gate.passed is not true`)
  if (!transport || transport.onlyExpectedTypedEvents !== true) {
    failures.push(`${prefix} -> transport events are not limited to expected QuickOpsEvents`)
  }
  if (
    transport &&
    !hasExactStringArray(
      transport.registeredEvents,
      QUICK_OPS_SURFACE_AUDIT_EXPECTED_TRANSPORT_EVENTS
    )
  ) {
    failures.push(`${prefix} -> registered transport events do not match expected QuickOpsEvents`)
  }
  if (
    !flow ||
    flow.usesRegistry !== true ||
    flow.usesQuickOpsPluginId !== true ||
    flow.singleDeliveryHandler !== true
  ) {
    failures.push(`${prefix} -> Flow registry or delivery handler evidence is incomplete`)
  }
  if (!sdk) {
    failures.push(`${prefix} -> sdk section is missing`)
  } else {
    const methodFields = [
      'transportSdkMethods',
      'pluginSdkMethods',
      'pluginRuntimeMethods'
    ] as const
    for (const field of methodFields) {
      if (!hasExactStringArray(sdk[field], QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS)) {
        failures.push(`${prefix} -> ${field} does not match the bounded host facade contract`)
      }
    }
    const typedEventFields = [
      'transportSdkUsesTypedEvents',
      'pluginSdkUsesTypedEvents',
      'pluginRuntimeUsesTypedEvents'
    ] as const
    for (const field of typedEventFields) {
      if (sdk[field] !== true) {
        failures.push(`${prefix} -> ${field} is not true`)
      }
    }
    if (sdk.exposesForbiddenExecutionMethods !== false) {
      failures.push(`${prefix} -> forbidden execution methods are exposed`)
    }
  }
  if (!Array.isArray(forbiddenSurfaceHits) || forbiddenSurfaceHits.length > 0) {
    failures.push(`${prefix} -> forbidden surface hits are present`)
  }

  return failures
}

function validateStructuredDispatchCoverage(
  path: string,
  coverage: Record<string, unknown> | null
): string[] {
  const prefix = `QuickOps Flow/AI adapter artifact is invalid: ${path}`
  const requiredCoverage = [
    'readOnly',
    'stateful',
    'fileWriting',
    'notification',
    'clipboard',
    'folderOpen'
  ] as const

  if (!coverage) return [`${prefix} -> structuredDispatchCoverage section is missing`]
  return requiredCoverage.flatMap((field) =>
    coverage[field] === true ? [] : [`${prefix} -> structuredDispatchCoverage.${field} is not true`]
  )
}

function validateFlowAiAdapterAuditArtifact(
  path: string,
  audit: Record<string, unknown>
): string[] {
  const failures: string[] = []
  const flow = getRecord(audit, 'flow')
  const confirmation = getRecord(audit, 'confirmation')
  const ai = getRecord(audit, 'ai')
  const gate = getRecord(audit, 'gate')
  const prefix = `QuickOps Flow/AI adapter artifact is invalid: ${path}`

  if (gate?.passed !== true) failures.push(`${prefix} -> gate.passed is not true`)
  if (!flow) {
    failures.push(`${prefix} -> flow section is missing`)
  } else {
    if (flow.allTargetsRegistered !== true) {
      failures.push(`${prefix} -> allTargetsRegistered is not true`)
    }
    if (!hasExactStringArray(flow.registeredTargets, QUICK_OPS_FLOW_AI_EXPECTED_TARGETS)) {
      failures.push(`${prefix} -> registeredTargets do not match expected QuickOps Flow targets`)
    }
    if (flow.requireConfirmMatchesExpected !== true) {
      failures.push(`${prefix} -> requireConfirmMatchesExpected is not true`)
    }
    if (
      !hasExactStringArray(flow.requireConfirmTargets, QUICK_OPS_FLOW_AI_EXPECTED_CONFIRM_TARGETS)
    ) {
      failures.push(`${prefix} -> requireConfirmTargets do not match expected confirmation set`)
    }
    failures.push(
      ...validateStructuredDispatchCoverage(path, getRecord(flow, 'structuredDispatchCoverage'))
    )
    const booleanFields = [
      'coversPolicyBlockedAck',
      'recordsAuditWithoutPayloadValues',
      'redactsClipboardAck',
      'exposesDegradedAck'
    ] as const
    for (const field of booleanFields) {
      if (flow[field] !== true) failures.push(`${prefix} -> ${field} is not true`)
    }
  }

  if (!confirmation) {
    failures.push(`${prefix} -> confirmation section is missing`)
  } else {
    const confirmationFields = [
      'flowBusRequiresOneTimeToken',
      'flowBusConsumesConfirmationToken',
      'selectorRequestsConfirmationToken',
      'selectorSeparatesConfirmationFromConsent'
    ] as const
    for (const field of confirmationFields) {
      if (confirmation[field] !== true) failures.push(`${prefix} -> ${field} is not true`)
    }
  }

  if (!ai) {
    failures.push(`${prefix} -> ai section is missing`)
  } else {
    const aiFields = [
      'hasNaturalLanguageAdapter',
      'linksRequestTargetConfirmationResult',
      'blocksHighRiskWithoutConfirmation',
      'hasRuntimeDispatchBridge'
    ] as const
    for (const field of aiFields) {
      if (ai[field] !== true) failures.push(`${prefix} -> ${field} is not true`)
    }
    if (!Array.isArray(ai.adapterSignals) || ai.adapterSignals.length === 0) {
      failures.push(`${prefix} -> adapterSignals are missing`)
    }
  }

  return failures
}

export function validateQuickOpsEvidenceArtifactContents(
  item: QuickOpsEvidenceItem,
  artifacts: QuickOpsEvidenceArtifactContent[]
): string[] {
  if (item.id === 'quickops-packaged-session-cleanup') {
    const packagedArtifacts = collectPackagedSessionCleanupArtifacts(artifacts)
    if (packagedArtifacts.length === 0) {
      return [
        'QuickOps packaged session cleanup evidence has no quickops-packaged-session-cleanup/v1 JSON artifact'
      ]
    }

    return packagedArtifacts.flatMap((artifact) =>
      validatePackagedSessionCleanupArtifact(artifact.path, artifact.evidence)
    )
  }

  if (item.id === 'quickops-platform-readonly') {
    const platformArtifacts = collectPlatformReadonlyArtifacts(artifacts)
    if (platformArtifacts.length === 0) {
      return [
        'QuickOps platform readonly evidence has no quickops-platform-readonly/v1 JSON artifacts'
      ]
    }

    return [
      ...validatePlatformReadonlyArtifactSet(platformArtifacts),
      ...platformArtifacts.flatMap((artifact) =>
        validatePlatformReadonlyArtifact(artifact.path, artifact.evidence)
      )
    ]
  }

  if (item.id === 'quickops-files-and-temp') {
    const filesAndTempArtifacts = collectFilesAndTempArtifacts(artifacts)
    if (filesAndTempArtifacts.length === 0) {
      return ['QuickOps files/temp evidence has no quickops-files-and-temp/v1 JSON artifact']
    }

    return filesAndTempArtifacts.flatMap((artifact) =>
      validateFilesAndTempArtifact(artifact.path, artifact.evidence)
    )
  }

  if (item.id === 'quickops-confirmation-and-policy') {
    const confirmationPolicyArtifacts = collectConfirmationPolicyArtifacts(artifacts)
    if (confirmationPolicyArtifacts.length === 0) {
      return [
        'QuickOps confirmation/policy evidence has no quickops-confirmation-policy/v1 JSON artifact'
      ]
    }

    return confirmationPolicyArtifacts.flatMap((artifact) =>
      validateConfirmationPolicyArtifact(artifact.path, artifact.evidence)
    )
  }

  if (item.id === 'quickops-flow-ai-adapter') {
    const audits = collectFlowAiAdapterAuditArtifacts(artifacts)
    if (audits.length === 0) {
      return [
        'QuickOps Flow/AI adapter evidence has no quickops-flow-ai-adapter-audit/v1 JSON artifact'
      ]
    }

    return audits.flatMap((artifact) =>
      validateFlowAiAdapterAuditArtifact(artifact.path, artifact.audit)
    )
  }

  if (item.id !== 'quickops-sdk-transport-surface') return []

  const audits = collectSurfaceAuditArtifacts(artifacts)
  if (audits.length === 0) {
    return [
      'QuickOps SDK/transport surface evidence has no quickops-surface-audit/v1 JSON artifact'
    ]
  }

  return audits.flatMap((artifact) => validateSurfaceAuditArtifact(artifact.path, artifact.audit))
}

export function buildQuickOpsEvidenceManifest(params: {
  baselineVersion: string
  generatedAt?: string
  evidenceDir?: string
}): QuickOpsEvidenceManifest {
  const evidenceDir = normalizeEvidenceDir(params.evidenceDir ?? 'evidence/quickops')
  const manifestPath = `${evidenceDir}/quickops-evidence-manifest.json`

  return {
    schema: QUICK_OPS_EVIDENCE_SCHEMA,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    baselineVersion: params.baselineVersion,
    verification: {
      recommendedCommand: `pnpm -C "apps/core-app" run quickops:evidence:verify -- --input "${manifestPath}" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireExistingArtifacts --requireNonEmptyArtifacts`
    },
    cases: QUICK_OPS_EVIDENCE_CASES.map((evidenceCase) => ({
      id: evidenceCase.id,
      status: 'pending',
      artifactPaths: [],
      checkedEvidence: [],
      notes: ''
    }))
  }
}

export function verifyQuickOpsEvidenceManifest(
  manifest: QuickOpsEvidenceManifest,
  options: QuickOpsEvidenceGateOptions = {}
): QuickOpsEvidenceGate {
  const failures: string[] = []

  if (manifest.schema !== QUICK_OPS_EVIDENCE_SCHEMA) {
    return {
      passed: false,
      failures: [`Unsupported QuickOps evidence manifest schema: ${String(manifest.schema)}`]
    }
  }

  const itemsById = new Map(manifest.cases.map((item) => [item.id, item]))

  for (const evidenceCase of QUICK_OPS_EVIDENCE_CASES) {
    const item = itemsById.get(evidenceCase.id)
    if (!item) {
      failures.push(`Missing QuickOps evidence case: ${evidenceCase.id}`)
      continue
    }

    if (options.requireAllPassed && evidenceCase.required && item.status !== 'passed') {
      failures.push(`QuickOps evidence case is not passed: ${evidenceCase.id}`)
    }

    const artifactPaths = item.artifactPaths.filter((artifactPath) => artifactPath.trim())
    if (options.requireArtifactPaths && evidenceCase.required && artifactPaths.length === 0) {
      failures.push(`QuickOps evidence case has no artifact path: ${evidenceCase.id}`)
    }

    if (
      options.requireVisualArtifacts &&
      evidenceCase.required &&
      evidenceCase.requiresVisualArtifact &&
      !artifactPaths.some(isVisualArtifactPath)
    ) {
      failures.push(
        `QuickOps evidence case has no screenshot or recording artifact: ${evidenceCase.id}`
      )
    }

    if (options.requireCheckedEvidence && evidenceCase.required) {
      const checkedEvidence = new Set(
        item.checkedEvidence.map((evidence) => normalizeEvidenceText(evidence)).filter(Boolean)
      )

      for (const requirement of evidenceCase.requiredEvidence) {
        if (!checkedEvidence.has(normalizeEvidenceText(requirement))) {
          failures.push(
            `QuickOps evidence case is missing required evidence check: ${evidenceCase.id} -> ${requirement}`
          )
        }
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures
  }
}

export function renderQuickOpsEvidenceTemplate(manifest: QuickOpsEvidenceManifest): string {
  const itemsById = new Map(manifest.cases.map((item) => [item.id, item]))
  const lines = [
    '# QuickOps Evidence',
    '',
    `- Schema: ${manifest.schema}`,
    `- Baseline version: ${manifest.baselineVersion}`,
    `- Generated at: ${manifest.generatedAt}`,
    '',
    '## Collection Rules',
    '',
    '- Use the current packaged CoreApp build for packaged/visual evidence.',
    '- Keep platform and file evidence local-first; do not add external requests unless the case explicitly requires them.',
    '- Redact Home, userData, proxy credentials, clipboard contents, and private file contents from shared artifacts.',
    '- Mark a case as blocked instead of passed when evidence is incomplete or collected from mocks only.',
    ''
  ]

  for (const evidenceCase of QUICK_OPS_EVIDENCE_CASES) {
    const item = itemsById.get(evidenceCase.id)
    const checkedEvidence = new Set(
      (item?.checkedEvidence ?? []).map((evidence) => normalizeEvidenceText(evidence))
    )

    lines.push(`## ${evidenceCase.title}`, '')
    lines.push(`- ID: ${evidenceCase.id}`)
    lines.push(`- Group: ${evidenceCase.group}`)
    lines.push(`- Required: ${evidenceCase.required ? 'yes' : 'no'}`)
    lines.push(`- Requires visual artifact: ${evidenceCase.requiresVisualArtifact ? 'yes' : 'no'}`)
    lines.push(`- Status: ${item?.status ?? 'pending'}`)
    lines.push('- Collection steps:')
    for (const step of evidenceCase.collectionSteps) lines.push(`  - ${step}`)

    lines.push('- Required evidence:')
    for (const requirement of evidenceCase.requiredEvidence) {
      const marker = checkedEvidence.has(normalizeEvidenceText(requirement)) ? 'x' : ' '
      lines.push(`  - [${marker}] ${requirement}`)
    }

    lines.push('- Recommended artifacts:')
    for (const artifact of evidenceCase.recommendedArtifacts) lines.push(`  - ${artifact}`)

    lines.push('- Artifact paths:')
    const artifactPaths = item?.artifactPaths.filter((artifactPath) => artifactPath.trim()) ?? []
    if (artifactPaths.length === 0) {
      lines.push('  - _none_')
    } else {
      for (const artifactPath of artifactPaths) lines.push(`  - ${artifactPath}`)
    }

    lines.push('- Block instead of pass when:')
    for (const blocked of evidenceCase.blockedWhen) lines.push(`  - ${blocked}`)
    if (item?.notes?.trim()) lines.push(`- Notes: ${item.notes.trim()}`)
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

function inferEvidenceDir(manifest: QuickOpsEvidenceManifest): string {
  const command = manifest.verification?.recommendedCommand ?? ''
  const match = command.match(/--input "(.+)\/quickops-evidence-manifest\.json"/)
  return normalizeEvidenceDir(match?.[1] ?? 'evidence/quickops')
}

export function renderQuickOpsEvidenceCollectionPlan(manifest: QuickOpsEvidenceManifest): string {
  const evidenceDir = inferEvidenceDir(manifest)
  const itemsById = new Map(manifest.cases.map((item) => [item.id, item]))
  const lines = [
    '# QuickOps Evidence Collection Plan',
    '',
    `- Schema: ${manifest.schema}`,
    `- Baseline version: ${manifest.baselineVersion}`,
    `- Generated at: ${manifest.generatedAt}`,
    '',
    '## 0. Prepare Evidence Files',
    '',
    'Run this from the repository root after building or selecting the packaged CoreApp artifact under test:',
    '',
    '```bash',
    `pnpm -C "apps/core-app" run quickops:evidence:template -- --output "${evidenceDir}/quickops-evidence-manifest.json" --writeChecklist --writePlan`,
    '```',
    '',
    'Do not mark a case `passed` until the manifest references current artifacts and every required evidence item is checked.',
    '',
    '## 1. Source-Level Gate Artifacts',
    '',
    'These commands produce required source-level artifacts. They do not replace packaged, platform, visual, or real confirmation UI evidence.',
    '',
    '```bash',
    `pnpm -C "apps/core-app" run quickops:surface:audit -- --output "${evidenceDir}/sdk-transport-surface.json" --strict`,
    `pnpm -C "apps/core-app" run quickops:flow-ai:audit -- --output "${evidenceDir}/flow-ai-adapter-audit.json" --strict`,
    '```',
    '',
    '## 2. Manual And Packaged Evidence Matrix',
    ''
  ]

  for (const evidenceCase of QUICK_OPS_EVIDENCE_CASES) {
    const item = itemsById.get(evidenceCase.id)
    lines.push(`### ${evidenceCase.title}`, '')
    lines.push(`- ID: ${evidenceCase.id}`)
    lines.push(`- Group: ${evidenceCase.group}`)
    lines.push(`- Current manifest status: ${item?.status ?? 'pending'}`)
    lines.push(`- Visual artifact required: ${evidenceCase.requiresVisualArtifact ? 'yes' : 'no'}`)
    lines.push('- Collect:')
    evidenceCase.collectionSteps.forEach((step, index) => {
      lines.push(`  ${index + 1}. ${step}`)
    })
    lines.push('- Attach artifacts:')
    for (const artifact of evidenceCase.recommendedArtifacts) lines.push(`  - ${artifact}`)
    lines.push('- Required checks before passing:')
    for (const requirement of evidenceCase.requiredEvidence) lines.push(`  - ${requirement}`)
    lines.push('- Keep blocked when:')
    for (const blocked of evidenceCase.blockedWhen) lines.push(`  - ${blocked}`)
    lines.push('')
  }

  lines.push('## 3. Verify Manifest', '')
  lines.push('After collecting artifacts and updating the manifest, run:')
  lines.push('')
  lines.push('```bash')
  lines.push(
    manifest.verification?.recommendedCommand ??
      `pnpm -C "apps/core-app" run quickops:evidence:verify -- --input "${evidenceDir}/quickops-evidence-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireExistingArtifacts --requireNonEmptyArtifacts`
  )
  lines.push('```')
  lines.push('')
  lines.push(
    'The verifier parses structured packaged cleanup, platform readonly, SDK/transport, and Flow/AI artifacts; screenshot, recording, packaged runtime, platform, and confirmation UI artifacts must still come from the current real environment.'
  )
  lines.push('')

  return `${lines.join('\n')}\n`
}
