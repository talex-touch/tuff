export const PLUGIN_SECURITY_SCANNER_VERSION = '1'
export const PLUGIN_SECURITY_RULE_SET_VERSION = '1'
export const PLUGIN_SECURITY_MAX_FILES = 4_096
export const PLUGIN_SECURITY_MAX_FILE_INSPECTION_BYTES = 2 * 1024 * 1024
export const PLUGIN_SECURITY_MAX_TOTAL_INSPECTION_BYTES = 16 * 1024 * 1024
export const PLUGIN_SECURITY_DEFAULT_TIMEOUT_MS = 5_000

export type PluginSecurityFindingSeverity = 'critical' | 'high' | 'medium' | 'low'
export type PluginSecurityScanDecision = 'passed' | 'review-required' | 'blocked' | 'unavailable'

export type PluginSecurityFindingCode
  = | 'PLUGIN_SCAN_PRIVATE_KEY_MATERIAL'
    | 'PLUGIN_SCAN_SECRET_MATERIAL'
    | 'PLUGIN_SCAN_PRODUCTION_DEV_SOURCE'
    | 'PLUGIN_SCAN_RAW_RUNTIME_ESCAPE'
    | 'PLUGIN_SCAN_DYNAMIC_EXECUTION'
    | 'PLUGIN_SCAN_NATIVE_BINARY'
    | 'PLUGIN_SCAN_PERMISSION_MISMATCH'
    | 'PLUGIN_SCAN_FILE_LIMIT_EXCEEDED'

export type PluginSecurityScanFailureCode
  = | 'PLUGIN_SCAN_ARTIFACT_DIGEST_INVALID'
    | 'PLUGIN_SCAN_INPUT_LIMIT_EXCEEDED'
    | 'PLUGIN_SCAN_TIMEOUT'
    | 'PLUGIN_SCAN_ENGINE_ERROR'
    | 'PLUGIN_SCAN_PACKAGE_POLICY_REQUIRED'

export interface PluginSecurityScanFile {
  path: string
  size: number
  sha256: string
  kind: 'text' | 'binary'
  text?: string
  truncated?: boolean
}

export interface PluginSecurityScanWaiver {
  id: string
  artifactSha256: string
  ruleId: PluginSecurityFindingCode
  owner: string
  reason: string
  createdAt: string
  expiresAt: string
  ticket?: string
}

export interface PluginSecurityFindingLocation {
  path: string
  line?: number
  column?: number
}

export interface PluginSecurityFindingWaiver {
  id: string
  owner: string
  reason: string
  expiresAt: string
  ticket?: string
}

export interface PluginSecurityFinding {
  code: PluginSecurityFindingCode
  ruleId: PluginSecurityFindingCode
  severity: PluginSecurityFindingSeverity
  location: PluginSecurityFindingLocation
  fileSha256?: string
  permissionId?: string
  waiver?: PluginSecurityFindingWaiver
}

export interface PluginSecurityScanFailure {
  code: PluginSecurityScanFailureCode
}

export interface PluginSecurityScanReport {
  scannerVersion: typeof PLUGIN_SECURITY_SCANNER_VERSION
  ruleSetVersion: typeof PLUGIN_SECURITY_RULE_SET_VERSION
  artifactSha256: string
  policyVersion: string
  startedAt: string
  completedAt: string
  inspectedFiles: number
  inspectedBytes: number
  findings: readonly PluginSecurityFinding[]
  decision: PluginSecurityScanDecision
  failure?: PluginSecurityScanFailure
}

export interface PluginSecurityScanInput {
  artifactSha256: string
  policyVersion: string
  policyPassed: boolean
  manifest: unknown
  files: readonly PluginSecurityScanFile[]
  waivers?: readonly PluginSecurityScanWaiver[]
}

export interface PluginSecurityScanOptions {
  clock?: () => number
  timeoutMs?: number
}

interface RuleMatch {
  code: PluginSecurityFindingCode
  severity: PluginSecurityFindingSeverity
  index?: number
  permissionId?: string
}

const SHA256_RE = /^[a-f0-9]{64}$/
const PRIVATE_KEY_RE = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/
const HIGH_CONFIDENCE_SECRET_RE = /(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})/
const SECRET_ASSIGNMENT_RE = /(?:api[_-]?key|client[_-]?secret|access[_-]?token|private[_-]?key)\s*[:=]\s*['"][^'"\r\n]{8,}['"]/i
const RAW_RUNTIME_ESCAPE_PATTERNS = [
  /(?:from\s*['"]|require\s*\(\s*['"])electron(?:['"]|\/)/,
  /(?:from\s*['"]|require\s*\(\s*['"])@talex-touch\/utils\/transport(?:['"]|\/)/,
  /\bipcRenderer\s*\.\s*(?:send|sendSync|invoke|postMessage)\s*\(/,
  /\b(?:window|globalThis)\s*\.\s*(?:electron|electronAPI)\b/,
  /\bprocess\s*\.\s*(?:binding|mainModule)\b/,
  /\b__non_webpack_require__\b/,
] as const
const DYNAMIC_EXECUTION_PATTERNS = [
  /(?:from\s*['"]|require\s*\(\s*['"])(?:node:)?vm(?:['"]|\/)/,
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bFunction\s*\(\s*['"]/,
  /\bimportScripts\s*\(/,
  /\bWebAssembly\s*\.\s*(?:compile|instantiate)\s*\(/,
] as const
const NATIVE_BINARY_RE = /\.(?:node|dll|dylib|so|exe)$/i
const SECURITY_SCAN_EXECUTABLE_EXTENSIONS = new Set([
  '.cjs', '.html', '.htm', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.vue',
])
const SECURITY_SCAN_TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.html', '.htm', '.js', '.json', '.jsx', '.md', '.mjs',
  '.conf', '.crt', '.ini', '.key', '.pem', '.properties', '.svg', '.toml',
  '.ts', '.tsx', '.txt', '.vue', '.xml', '.yaml', '.yml',
])

export function isPluginSecurityScanTextPath(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/')
  const basename = normalizedPath.split('/').at(-1)?.toLowerCase() ?? ''
  if (basename === 'dockerfile' || basename === 'license' || basename === 'readme') return true
  if (basename === '.npmrc' || basename === '.yarnrc' || basename.startsWith('.env')) return true
  const extensionIndex = basename.lastIndexOf('.')
  if (extensionIndex < 0) return false
  return SECURITY_SCAN_TEXT_EXTENSIONS.has(basename.slice(extensionIndex))
}

function isPluginSecurityScanExecutablePath(path: string): boolean {
  const basename = path.replace(/\\/g, '/').split('/').at(-1)?.toLowerCase() ?? ''
  const extensionIndex = basename.lastIndexOf('.')
  return extensionIndex >= 0
    && SECURITY_SCAN_EXECUTABLE_EXTENSIONS.has(basename.slice(extensionIndex))
}

function compareLexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizePermissions(manifest: unknown): Set<string> {
  if (!isRecord(manifest) || !isRecord(manifest.permissions)) return new Set()
  const values = ['required', 'optional'].flatMap((field) => {
    const raw = manifest.permissions && isRecord(manifest.permissions)
      ? manifest.permissions[field]
      : undefined
    return Array.isArray(raw)
      ? raw.filter((value): value is string => typeof value === 'string')
      : []
  })
  return new Set(values)
}

function toLocation(path: string, text: string, index?: number): PluginSecurityFindingLocation {
  if (index === undefined || index < 0) return { path }
  const before = text.slice(0, index)
  const lines = before.split('\n')
  return {
    path,
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  }
}

function firstPatternIndex(text: string, patterns: readonly RegExp[]): number | undefined {
  let result: number | undefined
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    const index = text.search(pattern)
    if (index >= 0 && (result === undefined || index < result)) result = index
  }
  return result
}

function capabilityMatches(text: string, permissions: Set<string>): RuleMatch[] {
  const matches: RuleMatch[] = []
  const networkIndex = firstPatternIndex(text, [
    /\bfetch\s*\(/,
    /\bnew\s+WebSocket\s*\(/,
    /\bnew\s+XMLHttpRequest\s*\(/,
  ])
  if (networkIndex !== undefined && !permissions.has('network.internet')) {
    matches.push({
      code: 'PLUGIN_SCAN_PERMISSION_MISMATCH',
      severity: 'high',
      index: networkIndex,
      permissionId: 'network.internet',
    })
  }

  const fsIndex = firstPatternIndex(text, [
    /(?:from\s*['"]|require\s*\(\s*['"])(?:node:)?fs(?:\/promises)?['"]?/,
  ])
  if (
    fsIndex !== undefined
    && !permissions.has('fs.read')
    && !permissions.has('fs.write')
  ) {
    matches.push({
      code: 'PLUGIN_SCAN_PERMISSION_MISMATCH',
      severity: 'high',
      index: fsIndex,
      permissionId: 'fs.read',
    })
  }

  const shellIndex = firstPatternIndex(text, [
    /(?:from\s*['"]|require\s*\(\s*['"])(?:node:)?child_process(?:['"]|\/)/,
  ])
  if (shellIndex !== undefined && !permissions.has('system.shell')) {
    matches.push({
      code: 'PLUGIN_SCAN_PERMISSION_MISMATCH',
      severity: 'high',
      index: shellIndex,
      permissionId: 'system.shell',
    })
  }

  const clipboardIndex = firstPatternIndex(text, [
    /navigator\s*\.\s*clipboard/,
    /document\s*\.\s*execCommand\s*\(\s*['"](?:copy|paste)['"]/,
  ])
  if (
    clipboardIndex !== undefined
    && !permissions.has('clipboard.read')
    && !permissions.has('clipboard.write')
  ) {
    matches.push({
      code: 'PLUGIN_SCAN_PERMISSION_MISMATCH',
      severity: 'high',
      index: clipboardIndex,
      permissionId: 'clipboard.read',
    })
  }
  return matches
}

function scanText(path: string, text: string, permissions: Set<string>): RuleMatch[] {
  const matches: RuleMatch[] = []
  const privateKeyIndex = text.search(PRIVATE_KEY_RE)
  if (privateKeyIndex >= 0) {
    matches.push({
      code: 'PLUGIN_SCAN_PRIVATE_KEY_MATERIAL',
      severity: 'critical',
      index: privateKeyIndex,
    })
  }

  const highSecretIndex = text.search(HIGH_CONFIDENCE_SECRET_RE)
  const assignmentIndex = text.search(SECRET_ASSIGNMENT_RE)
  const secretIndex = [highSecretIndex, assignmentIndex]
    .filter(index => index >= 0)
    .sort((left, right) => left - right)[0]
  if (secretIndex !== undefined) {
    matches.push({
      code: 'PLUGIN_SCAN_SECRET_MATERIAL',
      severity: 'critical',
      index: secretIndex,
    })
  }

  if (!isPluginSecurityScanExecutablePath(path)) return matches

  const escapeIndex = firstPatternIndex(text, RAW_RUNTIME_ESCAPE_PATTERNS)
  if (escapeIndex !== undefined) {
    matches.push({
      code: 'PLUGIN_SCAN_RAW_RUNTIME_ESCAPE',
      severity: 'critical',
      index: escapeIndex,
    })
  }

  const dynamicIndex = firstPatternIndex(text, DYNAMIC_EXECUTION_PATTERNS)
  if (dynamicIndex !== undefined) {
    matches.push({
      code: 'PLUGIN_SCAN_DYNAMIC_EXECUTION',
      severity: 'high',
      index: dynamicIndex,
    })
  }

  matches.push(...capabilityMatches(text, permissions))
  return matches
}

function validWaiver(
  waivers: readonly PluginSecurityScanWaiver[],
  artifactSha256: string,
  finding: PluginSecurityFinding,
  now: number,
): PluginSecurityFindingWaiver | undefined {
  if (finding.severity === 'critical') return undefined
  const waiver = waivers.find(candidate =>
    candidate.artifactSha256 === artifactSha256
    && candidate.ruleId === finding.ruleId
    && Boolean(candidate.id.trim())
    && Boolean(candidate.owner.trim())
    && Boolean(candidate.reason.trim())
    && Number.isFinite(Date.parse(candidate.createdAt))
    && Date.parse(candidate.createdAt) <= now
    && Date.parse(candidate.expiresAt) > now)
  if (!waiver) return undefined
  return {
    id: waiver.id,
    owner: waiver.owner,
    reason: waiver.reason,
    expiresAt: waiver.expiresAt,
    ...(waiver.ticket ? { ticket: waiver.ticket } : {}),
  }
}

function unavailableReport(
  input: PluginSecurityScanInput,
  startedAt: number,
  completedAt: number,
  code: PluginSecurityScanFailureCode,
  inspectedFiles = 0,
  inspectedBytes = 0,
): PluginSecurityScanReport {
  return {
    scannerVersion: PLUGIN_SECURITY_SCANNER_VERSION,
    ruleSetVersion: PLUGIN_SECURITY_RULE_SET_VERSION,
    artifactSha256: input.artifactSha256,
    policyVersion: input.policyVersion,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    inspectedFiles,
    inspectedBytes,
    findings: [],
    decision: 'unavailable',
    failure: { code },
  }
}

export function scanPluginPackage(
  input: PluginSecurityScanInput,
  options: PluginSecurityScanOptions = {},
): PluginSecurityScanReport {
  const clock = options.clock ?? Date.now
  const startedAt = clock()
  let inspectedFiles = 0
  let inspectedBytes = 0

  try {
    if (!SHA256_RE.test(input.artifactSha256)) {
      return unavailableReport(
        input,
        startedAt,
        clock(),
        'PLUGIN_SCAN_ARTIFACT_DIGEST_INVALID',
      )
    }
    if (!input.policyPassed || !input.policyVersion.trim()) {
      return unavailableReport(
        input,
        startedAt,
        clock(),
        'PLUGIN_SCAN_PACKAGE_POLICY_REQUIRED',
      )
    }
    if (input.files.length > PLUGIN_SECURITY_MAX_FILES) {
      return unavailableReport(
        input,
        startedAt,
        clock(),
        'PLUGIN_SCAN_INPUT_LIMIT_EXCEEDED',
      )
    }

    const timeoutMs = options.timeoutMs ?? PLUGIN_SECURITY_DEFAULT_TIMEOUT_MS
    const deadline = startedAt + timeoutMs
    const permissions = normalizePermissions(input.manifest)
    const findings: PluginSecurityFinding[] = []
    const manifest = isRecord(input.manifest) ? input.manifest : {}
    const dev = isRecord(manifest.dev) ? manifest.dev : null
    if (dev && (dev.enable === true || dev.source === true || Boolean(String(dev.address ?? '').trim()))) {
      findings.push({
        code: 'PLUGIN_SCAN_PRODUCTION_DEV_SOURCE',
        ruleId: 'PLUGIN_SCAN_PRODUCTION_DEV_SOURCE',
        severity: 'high',
        location: { path: 'manifest.json' },
      })
    }

    const files = input.files
      .slice()
      .sort((left, right) => compareLexical(left.path, right.path))
    for (const file of files) {
      if (clock() > deadline) {
        return unavailableReport(
          input,
          startedAt,
          clock(),
          'PLUGIN_SCAN_TIMEOUT',
          inspectedFiles,
          inspectedBytes,
        )
      }
      inspectedFiles += 1
      inspectedBytes += Math.min(file.size, PLUGIN_SECURITY_MAX_FILE_INSPECTION_BYTES)
      if (inspectedBytes > PLUGIN_SECURITY_MAX_TOTAL_INSPECTION_BYTES) {
        return unavailableReport(
          input,
          startedAt,
          clock(),
          'PLUGIN_SCAN_INPUT_LIMIT_EXCEEDED',
          inspectedFiles,
          inspectedBytes,
        )
      }

      if (NATIVE_BINARY_RE.test(file.path)) {
        findings.push({
          code: 'PLUGIN_SCAN_NATIVE_BINARY',
          ruleId: 'PLUGIN_SCAN_NATIVE_BINARY',
          severity: 'high',
          location: { path: file.path },
          fileSha256: file.sha256,
        })
      }

      if (file.truncated || file.size > PLUGIN_SECURITY_MAX_FILE_INSPECTION_BYTES) {
        findings.push({
          code: 'PLUGIN_SCAN_FILE_LIMIT_EXCEEDED',
          ruleId: 'PLUGIN_SCAN_FILE_LIMIT_EXCEEDED',
          severity: 'high',
          location: { path: file.path },
          fileSha256: file.sha256,
        })
        continue
      }
      if (file.kind !== 'text' || file.text === undefined) continue

      for (const match of scanText(file.path, file.text, permissions)) {
        findings.push({
          code: match.code,
          ruleId: match.code,
          severity: match.severity,
          location: toLocation(file.path, file.text, match.index),
          fileSha256: file.sha256,
          ...(match.permissionId ? { permissionId: match.permissionId } : {}),
        })
      }
    }

    findings.sort((left, right) =>
      left.location.path.localeCompare(right.location.path, 'en')
      || (left.location.line ?? 0) - (right.location.line ?? 0)
      || (left.location.column ?? 0) - (right.location.column ?? 0)
      || compareLexical(left.ruleId, right.ruleId))

    const completedAt = clock()
    const now = completedAt
    const waivers = input.waivers ?? []
    const resolvedFindings = findings.map((finding) => {
      const waiver = validWaiver(waivers, input.artifactSha256, finding, now)
      return waiver ? { ...finding, waiver } : finding
    })
    const unwaived = resolvedFindings.filter(finding => !finding.waiver)
    const decision: PluginSecurityScanDecision = unwaived.some(
      finding => finding.severity === 'critical' || finding.severity === 'high',
    )
      ? 'blocked'
      : unwaived.length > 0
        ? 'review-required'
        : 'passed'

    return {
      scannerVersion: PLUGIN_SECURITY_SCANNER_VERSION,
      ruleSetVersion: PLUGIN_SECURITY_RULE_SET_VERSION,
      artifactSha256: input.artifactSha256,
      policyVersion: input.policyVersion,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date(completedAt).toISOString(),
      inspectedFiles,
      inspectedBytes,
      findings: resolvedFindings,
      decision,
    }
  }
  catch {
    return unavailableReport(
      input,
      startedAt,
      clock(),
      'PLUGIN_SCAN_ENGINE_ERROR',
      inspectedFiles,
      inspectedBytes,
    )
  }
}

export function serializePluginSecurityScanReport(
  report: PluginSecurityScanReport,
): string {
  return JSON.stringify(report)
}
