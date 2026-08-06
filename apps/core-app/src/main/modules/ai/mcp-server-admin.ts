/**
 * Settings-side management of MCP servers.
 *
 * Listing, enabling, disabling and deleting already ride the orchestrator
 * store's imported-item channels, because a hand-entered server is stored as an
 * imported item — same row shape, same runtime reconcile pass, same delete
 * path. Only two things those channels cannot express live here: writing a
 * server the user typed instead of imported, and asking a server whether it is
 * actually reachable.
 *
 * Every effect is injected so the rules stay testable without Electron, the
 * database, or a live MCP process.
 */

import type {
  McpManualServerInput,
  McpProbeResult
} from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import type {
  AiImportSecretDescriptor,
  AiImportedConfigItem
} from '@talex-touch/utils/types/ai-orchestrator'
import type { ManualImportedItemInput } from './ai-orchestrator-store'
import type { IntelligenceMcpProfile } from './intelligence-mcp-registry'
import { createHash, randomUUID } from 'node:crypto'

const MAX_TEXT_LENGTH = 512
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
/** RFC 7230 header field-name token. */
const HEADER_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/

export interface McpServerAdminDeps {
  getItem: (itemId: string) => Promise<AiImportedConfigItem | null>
  persistManualItem: (input: ManualImportedItemInput) => Promise<AiImportedConfigItem>
  mcpProfilesFromItem: (item: AiImportedConfigItem) => IntelligenceMcpProfile[]
  registerProfile: (profile: IntelligenceMcpProfile) => void
  unregisterProfile: (profileId: string) => Promise<unknown>
  /** Connects if needed and reports the server's tool list. */
  listServerTools: (profileId: string) => Promise<unknown[]>
  secureStore: {
    isAvailable: () => boolean
    read: (authRef: string) => Promise<string | null>
    write: (authRef: string, value: string | null) => Promise<boolean>
  }
  /** Reconciles the registry so an edit is live for the next conversation turn. */
  refreshRuntime: () => Promise<void>
  newItemId?: () => string
}

export interface McpServerAdmin {
  upsertManual: (input: McpManualServerInput & { itemId?: string }) => Promise<{ itemId: string }>
  probe: (itemId: string) => Promise<McpProbeResult>
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Same shape as the importer's references, so one deletion path frees the
 * secrets of both origins and any future prefix sweep catches both too.
 */
function authRefFor(itemId: string, keyPath: string): string {
  return `ai.import.${hash(itemId).slice(0, 16)}.${hash(keyPath).slice(0, 16)}`
}

function profileIdFor(itemId: string): string {
  return `manual.${hash(itemId).slice(0, 20)}`
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requireText(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(`MCP server ${field} is required`)
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`MCP server ${field} is too long`)
  return text
}

function normalizeArgs(args: unknown): string[] {
  if (args === undefined) return []
  if (!Array.isArray(args)) throw new Error('MCP server args must be a list of strings')
  return args.map((arg) => {
    if (typeof arg !== 'string') throw new Error('MCP server args must be a list of strings')
    if (arg.length > MAX_TEXT_LENGTH) throw new Error('MCP server args are too long')
    return arg
  })
}

function normalizeUrl(value: unknown): string {
  const raw = requireText(value, 'url')
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`MCP server url ${raw} is not a valid URL`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new Error('MCP server url must use http or https')
  return parsed.toString()
}

function normalizeSecretEntries(
  record: unknown,
  container: 'env' | 'headers',
  namePattern: RegExp
): Array<[string, string]> {
  if (record === undefined) return []
  if (!record || typeof record !== 'object' || Array.isArray(record))
    throw new Error(`MCP server ${container} must be an object`)
  return Object.entries(record as Record<string, unknown>).map(([key, value]) => {
    const name = key.trim()
    if (!namePattern.test(name)) throw new Error(`MCP server ${container} name ${key} is invalid`)
    if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH)
      throw new Error(`MCP server ${container} value for ${key} is invalid`)
    return [name, value] as [string, string]
  })
}

export function createMcpServerAdmin(deps: McpServerAdminDeps): McpServerAdmin {
  const writeSecrets = async (
    entries: Array<[string, string]>,
    secrets: AiImportSecretDescriptor[]
  ): Promise<Array<{ authRef: string; previousValue: string | null }>> => {
    const undo: Array<{ authRef: string; previousValue: string | null }> = []
    for (const [index, [, value]] of entries.entries()) {
      const secret = secrets[index]!
      const authRef = secret.authRef!
      const previousValue = await deps.secureStore.read(authRef)
      if (!(await deps.secureStore.write(authRef, value)))
        throw new Error(`Failed to store the MCP server credential ${secret.keyPath}`)
      undo.push({ authRef, previousValue })
    }
    return undo
  }

  return {
    upsertManual: async (input) => {
      const name = requireText(input.name, 'name')
      if (input.itemId) {
        const existing = await deps.getItem(input.itemId)
        if (!existing || existing.kind !== 'mcp')
          throw new Error(`MCP server ${input.itemId} is not configured`)
      }
      const itemId = input.itemId ?? `manual:${deps.newItemId?.() ?? randomUUID()}`

      const stdio = input.transport === 'stdio'
      const command = stdio ? requireText(input.command, 'command') : undefined
      const args = stdio ? normalizeArgs(input.args) : undefined
      const url = stdio ? undefined : normalizeUrl(input.url)
      // Nothing tells a credential apart from a plain setting once the user has
      // typed it, so every value moves into the secure store and the stored
      // profile keeps references only.
      const entries = stdio
        ? normalizeSecretEntries(input.env, 'env', ENV_NAME_PATTERN)
        : normalizeSecretEntries(input.headers, 'headers', HEADER_NAME_PATTERN)
      const container = stdio ? 'env' : 'headers'

      const authRefs: Record<string, string> = {}
      const secrets: AiImportSecretDescriptor[] = entries.map(([key, value]) => {
        const keyPath = `${container}.${key}`
        const authRef = authRefFor(itemId, keyPath)
        authRefs[key] = authRef
        return { keyPath, fingerprint: hash(value), authRef }
      })
      if (secrets.length > 0 && !deps.secureStore.isAvailable())
        throw new Error('Secure storage is unavailable for MCP server credentials')

      const profile: IntelligenceMcpProfile = stdio
        ? {
            id: profileIdFor(itemId),
            name,
            enabled: true,
            transport: {
              type: 'stdio',
              command: command!,
              args,
              env: {},
              envAuthRefs: authRefs
            },
            metadata: { origin: 'manual', requiredPermission: 'SYSTEM_EXEC' }
          }
        : {
            id: profileIdFor(itemId),
            name,
            enabled: true,
            transport: {
              type: 'streamable-http',
              url: url!,
              headers: {},
              headerAuthRefs: authRefs
            },
            metadata: { origin: 'manual', requiredPermission: 'NETWORK_ACCESS' }
          }

      const undo = await writeSecrets(entries, secrets)
      try {
        await deps.persistManualItem({
          itemId,
          kind: 'mcp',
          name,
          projection: {
            kind: 'mcp',
            name,
            origin: 'manual',
            transport: input.transport,
            mcpProfiles: [profile]
          },
          snapshot: {
            origin: 'manual',
            transport: input.transport,
            ...(stdio ? { command, args } : { url }),
            [`${container}Keys`]: entries.map(([key]) => key)
          },
          secrets,
          fingerprint: hash(
            JSON.stringify({
              name,
              transport: input.transport,
              command,
              args,
              url,
              secrets: secrets.map((secret) => [secret.keyPath, secret.fingerprint])
            })
          )
        })
        await deps.refreshRuntime()
      } catch (error) {
        for (const entry of [...undo].reverse())
          await deps.secureStore.write(entry.authRef, entry.previousValue).catch(() => false)
        throw error
      }
      return { itemId }
    },

    probe: async (itemId) => {
      const item = await deps.getItem(itemId)
      if (!item || item.kind !== 'mcp')
        return { ok: false, error: `MCP server ${itemId} is not configured` }
      const profiles = deps.mcpProfilesFromItem(item)
      if (profiles.length === 0) return { ok: false, error: 'This entry defines no MCP server' }

      const failures: string[] = []
      let toolCount = 0
      for (const profile of profiles) {
        if (profile.enabled === false) {
          failures.push(`${profile.name}: disabled until its credentials are re-entered`)
          continue
        }
        // The registry only holds what the runtime reconciled from active
        // items, so a switched-off row has to be registered to be reachable...
        deps.registerProfile(profile)
        try {
          toolCount += (await deps.listServerTools(profile.id)).length
        } catch (error) {
          failures.push(`${profile.name}: ${messageOf(error)}`)
        } finally {
          // ...and dropped again right after, so a probe never leaves a server
          // process running behind a switch the user left off.
          if (!item.active) await deps.unregisterProfile(profile.id).catch(() => undefined)
        }
      }
      return failures.length > 0
        ? { ok: false, error: failures.join('; ') }
        : { ok: true, toolCount }
    }
  }
}
