/**
 * Probing a server Tuff does not hold: one an agent's own configuration file declares.
 *
 * A server Tuff holds is probed through its stored copy (`mcp-server-admin.ts`). One it does not hold
 * is read again from the agent's file its row came from, with the checks an import makes — the same
 * containment, the file unchanged since the scan, the server still defined the way the row shows it,
 * and a server whose credentials an imported copy could not replay refused — then started alone,
 * asked for its tools, and stopped.
 *
 * Nothing is kept. No item, content snapshot or secure-store entry is written, and the agent's file
 * is only read. A credential in the definition reaches the server process for that one start, from
 * memory, and only once the user has agreed to it (`confirmSecrets`); it never appears in the answer.
 */

import type {
  McpProbeResult,
  McpServerDeclaredProbeRequest
} from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import type { AiImportScanResult } from '@talex-touch/utils/types/ai-orchestrator'
import type { BoundedImportFile } from '../ai-import-bounded-file'
import type { ParsedMcpProfile } from '../ai-import-config-parser'
import type { IntelligenceMcpProfile } from '../intelligence-mcp-registry'
import type { McpProbeRunner } from '../mcp-server-admin'
import { createHash, randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { MCP_SECRET_MASK } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import { readBoundedImportFile } from '../ai-import-bounded-file'
import { parseConfig, parseMcpProfiles } from '../ai-import-config-parser'
import {
  AI_IMPORT_SECRET_CONFIRMATION_REQUIRED,
  AI_IMPORT_SOURCE_CHANGED,
  MCP_SERVER_REAUTH_REQUIRED
} from '../ai-import-error-projection'
import { serversNeedingReauthentication } from '../ai-import-runtime'
import { probeProfile } from '../mcp-server-admin'
import { declaredServerKey, mcpFileContainment } from './mcp-inventory'

const MAX_FIELD_LENGTH = 512

export interface McpDeclaredProbeDeps {
  /** The discovery scan a row came from, as recorded when the page read the machine. */
  getScan: (scanId: string) => Promise<AiImportScanResult | null>
  runner: McpProbeRunner
  readFile?: (root: string, path: string) => Promise<BoundedImportFile>
  newProbeId?: () => string
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function field(value: unknown): string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_FIELD_LENGTH
    ? value
    : ''
}

function refused(code: string, reason: string): McpProbeResult {
  return { ok: false, error: `${code}: ${reason}` }
}

/** Environment variables, headers or a token: what starting the server would hand it. */
function carriesCredentials(profile: ParsedMcpProfile): boolean {
  return (
    Object.keys(profile.env).length > 0 ||
    Object.keys(profile.headers).length > 0 ||
    Boolean(profile.bearerToken)
  )
}

/** Every credential value the start hands over, longest first, so a longer one is masked whole. */
function credentialValues(profile: ParsedMcpProfile): string[] {
  const values = [...Object.values(profile.env), ...Object.values(profile.headers)]
  if (profile.bearerToken) values.push(profile.bearerToken)
  return [...new Set(values.filter((value) => value.length > 0))].sort(
    (left, right) => right.length - left.length
  )
}

/**
 * The registry fails with fixed sentences (`MCP server is unavailable.`), so today this changes
 * nothing; it is what keeps a credential out of the answer should a failure ever quote one.
 */
function scrub(text: string, values: readonly string[]): string {
  return values.reduce((result, value) => result.split(value).join(MCP_SECRET_MASK), text)
}

/**
 * The definition as the registry runs it, credentials inline: they live in this object for the
 * probe and go with it, never through the secure store.
 */
function probeTarget(profile: ParsedMcpProfile, id: string): IntelligenceMcpProfile | null {
  if (profile.type === 'stdio' && profile.command)
    return {
      id,
      name: profile.name,
      enabled: true,
      transport: {
        type: 'stdio',
        command: profile.command,
        args: profile.args,
        cwd: profile.cwd,
        env: { ...profile.env }
      },
      metadata: { origin: 'probe', requiredPermission: 'SYSTEM_EXEC' }
    }
  if (profile.type === 'http' && profile.url)
    return {
      id,
      name: profile.name,
      enabled: true,
      transport: {
        type: 'streamable-http',
        url: profile.url,
        headers: {
          ...profile.headers,
          ...(profile.bearerToken ? { Authorization: `Bearer ${profile.bearerToken}` } : {})
        }
      },
      metadata: { origin: 'probe', requiredPermission: 'NETWORK_ACCESS' }
    }
  return null
}

/**
 * Starts the one server a row shows, from the agent file it came from, and stops it again.
 *
 * Refusals come back in the answer with the codes the page already reads for an import — a file
 * changed since the scan, a server no longer declared, credentials that cannot be replayed, or
 * credentials the user has not agreed to yet — and every one of them is decided before anything is
 * started.
 */
export async function probeDeclaredServer(
  request: McpServerDeclaredProbeRequest,
  deps: McpDeclaredProbeDeps
): Promise<McpProbeResult> {
  const scanId = field(request?.scanId)
  const candidateId = field(request?.candidateId)
  const server = field(request?.server)
  const key = field(request?.key)
  if (!scanId || !candidateId || !server || !key)
    return { ok: false, error: 'The probe request does not name one server of one scan' }

  const scan = await deps.getScan(scanId)
  if (!scan) return refused(AI_IMPORT_SOURCE_CHANGED, 'the scan this row came from is gone')
  const candidate = scan.candidates.find((item) => item.id === candidateId)
  // The rows only ever name this machine's own MCP files (`loadMcpDiscovery`).
  if (!candidate || candidate.kind !== 'mcp' || candidate.scope !== 'user')
    return { ok: false, error: `${candidateId} is not an MCP file of this machine in that scan` }
  if (candidate.state === 'source-missing')
    return refused('MCP_SERVER_SOURCE_MISSING', 'the configuration file is gone')
  if (candidate.blockingIssues.length > 0)
    return { ok: false, error: `${candidateId} was blocked by the scan` }
  const source = scan.sources.find((item) => item.id === candidate.sourceId)
  if (!source) return { ok: false, error: `${candidateId} has no source in that scan` }

  let file: BoundedImportFile
  try {
    file = await (deps.readFile ?? readBoundedImportFile)(
      mcpFileContainment(source.rootPath, candidate.path),
      candidate.path
    )
  } catch {
    return refused('MCP_SERVER_SOURCE_MISSING', 'the configuration file can no longer be read')
  }
  if (file.canonicalPath !== candidate.path || hash(file.content) !== candidate.fingerprint)
    return refused(AI_IMPORT_SOURCE_CHANGED, 'the configuration file changed after the scan')

  const config = parseConfig(file.content, extname(file.canonicalPath).toLowerCase())
  const profile = config
    ? parseMcpProfiles(config).find((declared) => declared.name === server)
    : undefined
  if (!config || !profile)
    return refused('MCP_SERVER_SOURCE_MISSING', `the configuration no longer declares ${server}`)
  // The row the user is looking at: a definition that reads differently now is not what they chose.
  if (declaredServerKey(profile) !== key)
    return refused(AI_IMPORT_SOURCE_CHANGED, `${server} is defined differently than the row shows`)
  // What an import would refuse (OAuth, a token on the command line, a reference to a value kept
  // elsewhere) cannot start from the file either.
  if (serversNeedingReauthentication(config, candidate.id).has(server))
    return refused(MCP_SERVER_REAUTH_REQUIRED, `${server} needs its credentials re-entered`)
  if (carriesCredentials(profile) && request.confirmSecrets !== true)
    return refused(
      AI_IMPORT_SECRET_CONFIRMATION_REQUIRED,
      `${server} is started with its credentials only once the user agrees`
    )

  const target = probeTarget(profile, `probe.${deps.newProbeId?.() ?? randomUUID()}`)
  if (!target) return { ok: false, error: `${server} has no command or address to start` }
  const outcome = await probeProfile(deps.runner, target, false)
  return 'failure' in outcome
    ? { ok: false, error: `${server}: ${scrub(outcome.failure, credentialValues(profile))}` }
    : { ok: true, toolCount: outcome.toolCount }
}
