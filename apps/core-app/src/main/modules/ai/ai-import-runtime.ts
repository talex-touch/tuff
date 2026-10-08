import type {
  AiImportApplyRequest,
  AiImportCandidate,
  AiImportMcpServerSelection,
  AiImportSecretDescriptor,
  AiImportSourceSnapshot
} from '@talex-touch/utils/types/ai-orchestrator'
import type { AiPreparedImportTransaction } from './ai-import-types'
import type { IntelligenceMcpProfile } from './intelligence-mcp-registry'
import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { extname, isAbsolute } from 'node:path'
import { app } from 'electron'
import { resolveRuntimeRootPath } from '../../utils/app-root-path'
import {
  getSecureStoreValue,
  isSecureStoreAvailable,
  setSecureStoreValue
} from '../../utils/secure-store'
import { readBoundedImportFile } from './ai-import-bounded-file'
import { parseConfig, parseMcpProfiles, type ParsedMcpProfile } from './ai-import-config-parser'
import { aiImportContentStore } from './ai-import-content-store'

const SECURE_VALUE_PREFIX = '$secure:'
const SENSITIVE_SNAPSHOT_KEY = /token|api.?key|secret|password|credential|authorization|cookie/i
/**
 * A command-line argument that names a credential. Its value is what follows `=`, or the next
 * argument when there is no `=`.
 */
export const SENSITIVE_MCP_ARGUMENT = /token|api.?key|secret|password|credential|authorization/i
/** What the importer leaves in place of a credential it could not move into the secure store. */
export const REAUTH_REQUIRED_PLACEHOLDER = '$reauth-required'

/**
 * The arguments with every credential value replaced by `mask`, by the rule the importer applies
 * before it stores a profile — so a server read straight from an agent's file and its imported copy
 * (whose credentials already read {@link REAUTH_REQUIRED_PLACEHOLDER}) mask to the same list.
 */
export function maskMcpArguments(args: readonly string[], mask: string): string[] {
  let maskNext = false
  return args.map((arg) => {
    if (maskNext) {
      maskNext = false
      return mask
    }
    if (arg === REAUTH_REQUIRED_PLACEHOLDER) return mask
    if (!SENSITIVE_MCP_ARGUMENT.test(arg)) return arg
    const separator = arg.indexOf('=')
    if (separator > 0) return `${arg.slice(0, separator + 1)}${mask}`
    maskNext = true
    return arg
  })
}

interface SecretWrite {
  descriptor: AiImportSecretDescriptor
  value?: string
  /** The server whose definition holds the credential. */
  server: string
}

/**
 * What Tuff already holds from one MCP candidate: each imported server by name, with whether it runs
 * now. An apply that picks servers of that candidate adds them to these rather than replacing them.
 */
export type AiImportHeldMcpServers = ReadonlyMap<string, { running: boolean }>

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function authRefFor(candidateId: string, keyPath: string): string {
  return `ai.import.${hash(candidateId).slice(0, 16)}.${hash(keyPath).slice(0, 16)}`
}

function isExternalSecretReference(value: string): boolean {
  const trimmed = value.trim()
  return (
    /\$\{[^}]+\}/.test(trimmed) || /(?:^|\s)(?:env|keychain|credential|authref):/i.test(trimmed)
  )
}

function secureDescriptor(
  candidateId: string,
  server: string,
  keyPath: string,
  value: string,
  reauthRequired = false
): SecretWrite {
  const reauth = reauthRequired || isExternalSecretReference(value)
  const authRef = authRefFor(candidateId, keyPath)
  return {
    descriptor: {
      keyPath,
      fingerprint: hash(value),
      authRef: reauth ? undefined : authRef,
      reauthRequired: reauth
    },
    value: reauth ? undefined : value,
    server
  }
}

function profileRecord(
  config: Record<string, unknown>,
  profile: ParsedMcpProfile
): Record<string, unknown> | null {
  const root = config[profile.rootKey]
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null
  const value = (root as Record<string, unknown>)[profile.name]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function redactSensitiveSnapshot(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(redactSensitiveSnapshot)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_SNAPSHOT_KEY.test(key) ? '[redacted]' : redactSensitiveSnapshot(nested)
    ])
  )
}

function sanitizeMcpSecrets(config: Record<string, unknown>, candidateId: string): SecretWrite[] {
  const writes: SecretWrite[] = []
  for (const profile of parseMcpProfiles(config)) {
    const record = profileRecord(config, profile)
    if (!record) continue
    const prefix = `${profile.rootKey}.${profile.name}`
    const secure = (keyPath: string, value: string, reauthRequired = false): SecretWrite =>
      secureDescriptor(candidateId, profile.name, keyPath, value, reauthRequired)
    for (const containerName of ['env', 'headers'] as const) {
      const container = record[containerName]
      if (!container || typeof container !== 'object' || Array.isArray(container)) continue
      for (const [key, value] of Object.entries(container as Record<string, unknown>)) {
        if (typeof value !== 'string') continue
        const write = secure(`${prefix}.${containerName}.${key}`, value)
        writes.push(write)
        ;(container as Record<string, unknown>)[key] = write.descriptor.reauthRequired
          ? '$reauth-required'
          : `${SECURE_VALUE_PREFIX}${write.descriptor.authRef!}`
      }
    }
    if (Array.isArray(record.args)) {
      let redactNext = false
      record.args = record.args.map((arg, index) => {
        if (typeof arg !== 'string') return arg
        if (redactNext) {
          redactNext = false
          writes.push(secure(`${prefix}.args.${index}`, arg, true))
          return REAUTH_REQUIRED_PLACEHOLDER
        }
        if (!SENSITIVE_MCP_ARGUMENT.test(arg)) return arg
        const separator = arg.indexOf('=')
        if (separator > 0) {
          const value = arg.slice(separator + 1)
          writes.push(secure(`${prefix}.args.${index}`, value, true))
          return `${arg.slice(0, separator + 1)}${REAUTH_REQUIRED_PLACEHOLDER}`
        }
        redactNext = true
        return arg
      })
    }
    if (profile.type === 'http') {
      for (const tokenKey of ['bearer_token', 'bearerToken', 'token'] as const) {
        const value = record[tokenKey]
        if (typeof value !== 'string') continue
        const write = secure(`${prefix}.${tokenKey}`, `Bearer ${value}`)
        writes.push(write)
        const headers =
          record.headers && typeof record.headers === 'object' && !Array.isArray(record.headers)
            ? (record.headers as Record<string, unknown>)
            : ((record.headers = {}) as Record<string, unknown>)
        headers.Authorization = write.descriptor.reauthRequired
          ? '$reauth-required'
          : `Bearer ${SECURE_VALUE_PREFIX}${write.descriptor.authRef!}`
        delete record[tokenKey]
      }
    }
    for (const authKey of [
      'oauth',
      'oauth2',
      'client_secret',
      'clientSecret',
      'client_id',
      'clientId'
    ]) {
      const value = record[authKey]
      if (value === undefined) continue
      const serialized = typeof value === 'string' ? value : JSON.stringify(value)
      writes.push(secure(`${prefix}.${authKey}`, serialized, true))
      record[authKey] = '$reauth-required'
    }
  }
  return writes
}

function secureRef(value: unknown): string | undefined {
  return typeof value === 'string' && value.startsWith(SECURE_VALUE_PREFIX)
    ? value.slice(SECURE_VALUE_PREFIX.length)
    : undefined
}

function headerAuthRef(value: unknown): string | undefined {
  const direct = secureRef(value)
  if (direct) return direct
  if (typeof value !== 'string') return undefined
  const match = /^Bearer\s+\$secure:(.+)$/i.exec(value.trim())
  return match?.[1]
}

function normalizeMcpProfiles(
  candidate: AiImportCandidate,
  config: Record<string, unknown> | null,
  switchedOff: ReadonlySet<string> = new Set()
): IntelligenceMcpProfile[] {
  if (!config || candidate.kind !== 'mcp') return []
  const profiles: IntelligenceMcpProfile[] = []
  for (const profile of parseMcpProfiles(config)) {
    const id = `import.${candidate.provider}.${hash(`${candidate.sourceId}:${profile.name}`).slice(0, 20)}`
    const enabled = !profile.requiresReauth && !switchedOff.has(profile.name)
    if (profile.type === 'stdio' && profile.command) {
      const env: Record<string, string> = {}
      const envAuthRefs: Record<string, string> = {}
      for (const [key, value] of Object.entries(profile.env)) {
        const authRef = secureRef(value)
        if (authRef) envAuthRefs[key] = authRef
        else if (value !== REAUTH_REQUIRED_PLACEHOLDER) env[key] = value
      }
      profiles.push({
        id,
        name: profile.name,
        enabled,
        transport: {
          type: 'stdio',
          command: profile.command,
          args: profile.args,
          cwd: profile.cwd,
          env,
          envAuthRefs
        },
        metadata: {
          importedCandidateId: candidate.id,
          reauthRequired: profile.requiresReauth,
          requiredPermission: 'SYSTEM_EXEC'
        }
      })
      continue
    }
    if (profile.type === 'http' && profile.url) {
      const headers: Record<string, string> = {}
      const headerAuthRefs: Record<string, string> = {}
      for (const [key, value] of Object.entries(profile.headers)) {
        const authRef = headerAuthRef(value)
        if (authRef) headerAuthRefs[key] = authRef
        else if (value !== REAUTH_REQUIRED_PLACEHOLDER) headers[key] = value
      }
      profiles.push({
        id,
        name: profile.name,
        enabled,
        transport: {
          type: 'streamable-http',
          url: profile.url,
          headers,
          headerAuthRefs
        },
        metadata: {
          importedCandidateId: candidate.id,
          reauthRequired: profile.requiresReauth,
          requiredPermission: 'NETWORK_ACCESS'
        }
      })
    }
  }
  return profiles
}

/**
 * Rejects a server selection that does not fit this import before anything is read or written: an
 * entry for a candidate outside it, or for one that is not MCP, would otherwise be ignored silently,
 * and the user would get every server of a file they picked one from.
 */
function assertSelectionsFit(
  candidates: AiImportCandidate[],
  selections: AiImportApplyRequest['mcpServers']
): void {
  if (!selections) return
  const kindById = new Map(candidates.map((candidate) => [candidate.id, candidate.kind]))
  for (const candidateId of Object.keys(selections)) {
    const kind = kindById.get(candidateId)
    if (!kind)
      throw new Error(`MCP server selection names candidate ${candidateId} outside this import`)
    if (kind !== 'mcp')
      throw new Error(`MCP server selection names candidate ${candidateId}, which is not MCP`)
  }
}

/**
 * The servers of a file whose credentials the importer cannot move into the secure store — OAuth
 * settings, a credential on the command line, a reference to a value kept elsewhere. An imported
 * copy of one cannot run, and its stored item is marked invalid, which stops every server in it.
 *
 * Read off a dry run of the same sanitizer the import uses, on a copy of the MCP roots, so the answer
 * cannot drift from what the import would do. The settings page's probe of a server Tuff does not
 * hold asks the same question, so a server the import would refuse is not started for a probe either.
 */
export function serversNeedingReauthentication(
  config: Record<string, unknown>,
  candidateId: string
): Set<string> {
  const roots: Record<string, unknown> = {}
  for (const key of ['mcp_servers', 'mcpServers', 'mcp']) {
    if (key in config) roots[key] = structuredClone(config[key])
  }
  const blocked = new Set(
    parseMcpProfiles(roots)
      .filter((profile) => profile.requiresReauth)
      .map((profile) => profile.name)
  )
  for (const write of sanitizeMcpSecrets(roots, candidateId)) {
    if (write.descriptor.reauthRequired) blocked.add(write.server)
  }
  return blocked
}

/**
 * The servers an apply that picks some of a file's servers imports.
 *
 * The pick adds to what Tuff already holds from the file, never replaces it: a held server stays,
 * with its credentials, and keeps its switch — one that is not running now (switched off on its own,
 * or never started because its whole file was off) lands switched off, so turning one server on never
 * starts a neighbour. A picked server lands running unless the pick lists it as switched off.
 *
 * Picking a server that needs re-authentication is refused: it could not run, and it would stop the
 * rest of the file. A held one that does is left out — it never ran and holds nothing in the secure
 * store — and so is a held one the file no longer declares, which leaves nothing to import.
 */
function planServerSelection(
  config: Record<string, unknown>,
  candidateId: string,
  selection: AiImportMcpServerSelection,
  held: AiImportHeldMcpServers | undefined
): AiImportMcpServerSelection {
  const include = Array.isArray(selection.include) ? selection.include : []
  const disabled = Array.isArray(selection.disabled) ? selection.disabled : []
  if (include.length === 0) throw new Error(`MCP candidate ${candidateId} selects no server`)
  for (const name of disabled) {
    if (!include.includes(name))
      throw new Error(`MCP candidate ${candidateId} switches off server ${name} it does not import`)
  }
  const blocked = serversNeedingReauthentication(config, candidateId)
  const refused = [...new Set(include.filter((name) => blocked.has(name)))]
  if (refused.length > 0)
    throw new Error(
      `MCP_SERVER_REAUTH_REQUIRED: MCP candidate ${candidateId} selects ${refused.join(', ')}; a server that needs re-authentication cannot run from an imported copy`
    )
  if (!held) return { include, disabled }

  const declared = new Set(parseMcpProfiles(config).map((profile) => profile.name))
  const kept = [...held].filter(
    ([name]) => !include.includes(name) && declared.has(name) && !blocked.has(name)
  )
  return {
    include: [...include, ...kept.map(([name]) => name)],
    disabled: [...disabled, ...kept.filter(([, server]) => !server.running).map(([name]) => name)]
  }
}

/**
 * Narrows a parsed MCP configuration to the selected servers, in place, before secrets are
 * migrated or a snapshot is taken: an unselected server leaves no profile, no secret write and no
 * copy of its definition behind. Answers the selected servers that land switched off.
 */
function keepSelectedServers(
  config: Record<string, unknown>,
  candidateId: string,
  selection: AiImportMcpServerSelection
): Set<string> {
  const profiles = parseMcpProfiles(config)
  const declared = new Set(profiles.map((profile) => profile.name))
  const include = new Set(Array.isArray(selection.include) ? selection.include : [])
  if (include.size === 0) throw new Error(`MCP candidate ${candidateId} selects no server`)
  for (const name of include) {
    if (!declared.has(name))
      throw new Error(`MCP candidate ${candidateId} does not declare server ${name}`)
  }
  const switchedOff = new Set(Array.isArray(selection.disabled) ? selection.disabled : [])
  for (const name of switchedOff) {
    if (!include.has(name))
      throw new Error(`MCP candidate ${candidateId} switches off server ${name} it does not import`)
  }

  const rootKey = profiles[0]!.rootKey
  const root = config[rootKey] as Record<string, unknown>
  for (const name of Object.keys(root)) if (!include.has(name)) delete root[name]
  // The parser reads the first of these roots that is an object; a second one in the same file is
  // never imported, so a selection must not carry its definitions (or their credentials) along.
  for (const otherRoot of ['mcp_servers', 'mcpServers', 'mcp']) {
    if (otherRoot !== rootKey) delete config[otherRoot]
  }
  return switchedOff
}

function projectionFor(
  candidate: AiImportCandidate,
  contentRef: string,
  mcpProfiles: IntelligenceMcpProfile[],
  sanitizedContent: string
): Record<string, unknown> {
  const description = 'description' in candidate ? candidate.description : undefined
  return {
    kind: candidate.kind,
    name: candidate.name,
    description,
    contentRef,
    profileId:
      candidate.kind === 'agent'
        ? `import.${candidate.provider}.${hash(candidate.id).slice(0, 20)}`
        : undefined,
    instructions: ['agent', 'rule', 'instruction'].includes(candidate.kind)
      ? sanitizedContent
      : undefined,
    triggerMode: candidate.kind === 'command' ? 'explicit' : undefined,
    globs: candidate.kind === 'rule' ? candidate.globs : undefined,
    alwaysApply: candidate.kind === 'rule' ? candidate.alwaysApply : undefined,
    mcpProfiles
  }
}

export class AiImportRuntimeService {
  /**
   * Reads each candidate again, checks it is the file the preview saw, and readies what applying it
   * stores: projection, content snapshot, secret descriptors — with the credentials already moved
   * into the secure store, which {@link rollback} undoes if the commit fails.
   *
   * `held` names, per MCP candidate, the servers Tuff already holds from it; a server pick for that
   * candidate adds to them (see {@link planServerSelection}). A request without picks imports every
   * server of each MCP file, as before.
   */
  async prepare(
    scanCwd: string,
    candidates: AiImportCandidate[],
    request: AiImportApplyRequest,
    sources: AiImportSourceSnapshot[],
    held: ReadonlyMap<string, AiImportHeldMcpServers> = new Map()
  ): Promise<AiPreparedImportTransaction> {
    const rootPath = resolveRuntimeRootPath(app)
    const canonicalScanCwd = await realpath(scanCwd)
    const sourceRoots = new Map(sources.map((source) => [source.id, source.rootPath]))
    assertSelectionsFit(candidates, request.mcpServers)
    const transaction: AiPreparedImportTransaction = {
      items: [],
      createdContentRefs: [],
      secretUndo: []
    }
    try {
      for (const candidate of candidates) {
        const sourceRoot = sourceRoots.get(candidate.sourceId)
        if (!sourceRoot) throw new Error(`Import candidate ${candidate.id} has no matching source`)
        // Re-read within the directory discovery held the file to: an MCP file kept beside its
        // agent's directory (`~/.claude.json`) was never inside the source root.
        const containedBy = candidate.containedBy ?? sourceRoot
        if (!isAbsolute(containedBy))
          throw new Error(`Import candidate ${candidate.id} has no usable containment directory`)
        const sourceFile = await readBoundedImportFile(containedBy, candidate.path)
        if (sourceFile.canonicalPath !== candidate.path)
          throw new Error(
            `Import candidate ${candidate.id} changed its canonical path after preview`
          )
        const rawContent = sourceFile.content
        if (hash(rawContent) !== candidate.fingerprint)
          throw new Error(`Import candidate ${candidate.id} changed after preview`)

        const parsed = parseConfig(rawContent, extname(sourceFile.canonicalPath).toLowerCase())
        let sanitizedContent = rawContent
        let writes: SecretWrite[] = []
        let switchedOff: Set<string> | undefined
        if (candidate.kind === 'mcp') {
          if (!parsed)
            throw new Error(`MCP candidate ${candidate.id} has an unsupported configuration format`)
          if (parseMcpProfiles(parsed).length === 0)
            throw new Error(`MCP candidate ${candidate.id} has no supported profile`)
          const selection = request.mcpServers?.[candidate.id]
          // Narrowed before the secrets pass, so only the chosen servers' credentials are migrated.
          if (selection)
            switchedOff = keepSelectedServers(
              parsed,
              candidate.id,
              planServerSelection(parsed, candidate.id, selection, held.get(candidate.id))
            )
          writes = sanitizeMcpSecrets(parsed, candidate.id)
          sanitizedContent = JSON.stringify(parsed, null, 2)
        }

        // A value already in the secure store under its reference was migrated — and confirmed —
        // by an earlier import: applying it again asks nothing and rewrites nothing. Only a value
        // the store does not hold yet needs the user's go-ahead.
        const persistableWrites = writes.filter((write) => write.value !== undefined)
        const storeAvailable = persistableWrites.length > 0 && isSecureStoreAvailable(rootPath)
        const pendingWrites: Array<{ write: SecretWrite; previousValue: string | null }> = []
        for (const write of persistableWrites) {
          const previousValue = storeAvailable
            ? await getSecureStoreValue(rootPath, write.descriptor.authRef!, 'ai-import-secret')
            : null
          if (previousValue !== write.value) pendingWrites.push({ write, previousValue })
        }
        if (pendingWrites.length > 0 && request.confirmSecretMigration !== true) {
          const servers = [...new Set(pendingWrites.map(({ write }) => write.server))]
          throw new Error(
            `Import candidate ${candidate.id} requires secret migration confirmation for ${servers.join(', ')}`
          )
        }
        if (pendingWrites.length > 0 && !storeAvailable)
          throw new Error('Secure storage is unavailable for AI configuration import')
        for (const { write, previousValue } of pendingWrites) {
          const authRef = write.descriptor.authRef!
          const persisted = await setSecureStoreValue(
            rootPath,
            authRef,
            write.value!,
            'ai-import-secret'
          )
          if (!persisted)
            throw new Error(`Failed to persist imported secret ${write.descriptor.keyPath}`)
          transaction.secretUndo.push({ authRef, previousValue })
        }

        const mcpProfiles = normalizeMcpProfiles(candidate, parsed, switchedOff)
        if (candidate.kind === 'mcp' && mcpProfiles.length === 0)
          throw new Error(`MCP candidate ${candidate.id} has no usable profile`)
        if (candidate.kind === 'mcp' && parsed) {
          sanitizedContent = JSON.stringify(redactSensitiveSnapshot(parsed), null, 2)
        }
        const content = await aiImportContentStore.write(sanitizedContent)
        if (content.created) transaction.createdContentRefs.push(content.ref)
        const override = request.overrides?.[candidate.id]
        transaction.items.push({
          candidate,
          targetScope: override?.targetScope ?? candidate.targetScope,
          workspaceRoot:
            (override?.targetScope ?? candidate.targetScope) === 'workspace'
              ? canonicalScanCwd
              : undefined,
          alias: override?.alias?.trim() || undefined,
          contentRef: content.ref,
          projection: projectionFor(candidate, content.ref, mcpProfiles, sanitizedContent),
          secrets: writes.map((write) => write.descriptor),
          mcpProfiles
        })
      }
      return transaction
    } catch (error) {
      await this.rollback(transaction)
      throw error
    }
  }

  async rollback(transaction: AiPreparedImportTransaction): Promise<void> {
    const rootPath = resolveRuntimeRootPath(app)
    const failures: string[] = []
    for (const undo of [...transaction.secretUndo].reverse()) {
      const restored = await setSecureStoreValue(
        rootPath,
        undo.authRef,
        undo.previousValue,
        'ai-import-secret'
      ).catch(() => false)
      if (!restored) failures.push(`secure:${undo.authRef}`)
    }
    for (const ref of transaction.createdContentRefs) {
      try {
        await aiImportContentStore.remove(ref)
      } catch {
        failures.push(`content:${ref}`)
      }
    }
    if (failures.length > 0) {
      throw new Error(`AI import rollback failed for ${failures.join(', ')}`)
    }
  }
}

export const aiImportRuntimeService = new AiImportRuntimeService()
