/**
 * The MCP page's rows: one per server, merged across every agent that declares it, with Tuff's own
 * switch for each.
 *
 * Three inputs meet here: the servers this machine's agents declare in their own configuration
 * (read in place, never written), the servers already imported into Tuff (each stored item can
 * carry several), and the ones typed into settings by hand. A server is its name plus how it is
 * reached — the command line for stdio, the address for http — so `context7` run the same way by
 * Claude Code and Codex is one row, and a `context7` run any other way is another.
 *
 * Nothing that identifies a server here carries a credential. Environment and header values never
 * leave this module, an argument after a credential-looking flag is masked by the importer's own
 * rule before it is shown or hashed, and an address is shown without its query string.
 */

import type {
  McpServerAgentSource,
  McpServerDetail,
  McpServerInventory,
  McpServerRow,
  McpServerSetEnabledRequest,
  McpServerTuffState
} from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import type {
  AiAgentId,
  AiImportedConfigItem,
  AiImportOriginId,
  AiImportScanResult
} from '@talex-touch/utils/types/ai-orchestrator'
import type { BoundedImportFile } from '../ai-import-bounded-file'
import type { ParsedMcpProfile } from '../ai-import-config-parser'
import type { IntelligenceMcpProfile } from '../intelligence-mcp-registry'
import { createHash } from 'node:crypto'
import { dirname, extname, isAbsolute, relative } from 'node:path'
import { MCP_SECRET_MASK } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import { readBoundedImportFile } from '../ai-import-bounded-file'
import { parseConfig, parseMcpProfiles } from '../ai-import-config-parser'
import { maskMcpArguments } from '../ai-import-runtime'
import { mcpProfilesFromItem } from '../ai-imported-config-runtime'
import { countAgentPresence } from './agent-presence'

/** A server as one source describes it, already stripped of anything secret. */
interface ServerFacts {
  key: string
  name: string
  transport: 'stdio' | 'http'
  summary: string
  detail: McpServerDetail
  hasSecrets: boolean
}

/** One of the agent configuration files a discovery scan found, parsed. */
export interface McpDiscoveryFile {
  agentId: AiAgentId
  sourcePath: string
  candidateId: string
  profiles: ParsedMcpProfile[]
}

export interface McpDiscovery {
  files: McpDiscoveryFile[]
  unreadable: McpServerInventory['unreadableSources']
}

/** One server Tuff holds, inside an imported or hand-entered item. */
export interface McpTuffEntry {
  facts: ServerFacts
  itemId: string
  profileId: string
  origin: 'imported' | 'manual'
  provider: AiImportOriginId
  /** The item's own switch. */
  itemActive: boolean
  /** The server's own switch inside the item. */
  profileEnabled: boolean
  /** What stops it running even when both switches are on. */
  blockedReason?: McpServerTuffState['blockedReason']
  /** Both switches on and nothing in the way: the runtime registers it. */
  running: boolean
  updatedAt: number
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function serverKey(identity: unknown[]): string {
  return `mcp:${hash(JSON.stringify(identity)).slice(0, 32)}`
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

/** The address a server is reached at, as an identity and as something safe to show. */
function addressOf(raw: string): { identity: string; shown: string } {
  try {
    const url = new URL(raw.trim())
    url.hash = ''
    return { identity: url.toString(), shown: `${url.origin}${url.pathname}` }
  } catch {
    // Never reached for anything the parser or the admin accepted; still nothing to show.
    return { identity: raw.trim(), shown: '' }
  }
}

function stdioFacts(input: {
  name: string
  command: string
  args: readonly string[]
  envNames: string[]
  forcedSecret: boolean
}): ServerFacts {
  const command = input.command.trim()
  const args = maskMcpArguments(input.args, MCP_SECRET_MASK)
  const maskedAny = args.some((arg, index) => arg !== input.args[index])
  const envNames = sortedUnique(input.envNames)
  return {
    key: serverKey(['stdio', input.name, command, ...args]),
    name: input.name,
    transport: 'stdio',
    summary: [command, ...args].join(' '),
    detail: { command, args, envNames, headerNames: [] },
    hasSecrets: input.forcedSecret || maskedAny || envNames.length > 0
  }
}

function httpFacts(input: {
  name: string
  url: string
  headerNames: string[]
  forcedSecret: boolean
}): ServerFacts {
  const address = addressOf(input.url)
  const headerNames = sortedUnique(input.headerNames)
  return {
    key: serverKey(['http', input.name, address.identity]),
    name: input.name,
    transport: 'http',
    summary: address.shown,
    detail: { url: address.shown, envNames: [], headerNames },
    hasSecrets: input.forcedSecret || headerNames.length > 0
  }
}

/** A server as an agent's own configuration file declares it. */
function factsFromConfig(profile: ParsedMcpProfile): ServerFacts | null {
  if (profile.type === 'stdio' && profile.command)
    return stdioFacts({
      name: profile.name,
      command: profile.command,
      args: profile.args ?? [],
      envNames: Object.keys(profile.env),
      forcedSecret: profile.requiresReauth
    })
  if (profile.type === 'http' && profile.url)
    return httpFacts({
      name: profile.name,
      url: profile.url,
      headerNames: [
        ...Object.keys(profile.headers),
        ...(profile.bearerToken ? ['Authorization'] : [])
      ],
      forcedSecret: profile.requiresReauth || Boolean(profile.bearerToken)
    })
  return null
}

/** A server as Tuff stored it — credentials already moved out, references in their place. */
function factsFromStored(profile: IntelligenceMcpProfile): ServerFacts | null {
  const reauth = profile.metadata?.reauthRequired === true
  if (profile.transport.type === 'stdio') {
    const { command, args, env, envAuthRefs } = profile.transport
    if (typeof command !== 'string' || !command.trim()) return null
    return stdioFacts({
      name: profile.name,
      command,
      args: Array.isArray(args) ? args.filter((arg) => typeof arg === 'string') : [],
      envNames: [...Object.keys(env ?? {}), ...Object.keys(envAuthRefs ?? {})],
      forcedSecret: reauth
    })
  }
  const { url, headers, headerAuthRefs, authTokenKey } = profile.transport
  if (typeof url !== 'string' || !url.trim()) return null
  return httpFacts({
    name: profile.name,
    url,
    headerNames: [
      ...Object.keys(headers ?? {}),
      ...Object.keys(headerAuthRefs ?? {}),
      ...(authTokenKey?.trim() ? ['Authorization'] : [])
    ],
    forcedSecret: reauth
  })
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

/**
 * Reads the MCP configuration files a discovery scan found, bounded and in place.
 *
 * Only this machine's own (user-scope) files count: a project file is whatever folder the app was
 * started in, which says nothing about the agents installed here. A file is read through the same
 * containment the scan used — the agent's directory, or for an MCP file kept beside it
 * (`~/.claude.json` next to `~/.claude`), the file's own directory.
 */
export async function loadMcpDiscovery(
  scan: AiImportScanResult,
  readFile: (root: string, path: string) => Promise<BoundedImportFile> = readBoundedImportFile
): Promise<McpDiscovery> {
  const sources = new Map(scan.sources.map((source) => [source.id, source]))
  const discovery: McpDiscovery = { files: [], unreadable: [] }
  for (const candidate of scan.candidates) {
    if (candidate.kind !== 'mcp' || candidate.scope !== 'user') continue
    if (candidate.state === 'source-missing' || candidate.blockingIssues.length > 0) continue
    if (candidate.serverNames.length === 0) continue
    const source = sources.get(candidate.sourceId)
    if (!source) continue
    const where = { agentId: candidate.provider, sourcePath: candidate.path }
    const containedBy = isWithin(source.rootPath, candidate.path)
      ? source.rootPath
      : dirname(candidate.path)

    let parsed: Record<string, unknown> | null
    try {
      const file = await readFile(containedBy, candidate.path)
      parsed = parseConfig(file.content, extname(file.canonicalPath).toLowerCase())
    } catch {
      discovery.unreadable.push({ ...where, reason: 'unreadable' })
      continue
    }
    const profiles = parsed ? parseMcpProfiles(parsed) : []
    if (profiles.length === 0) {
      discovery.unreadable.push({ ...where, reason: 'unparseable' })
      continue
    }
    discovery.files.push({ ...where, candidateId: candidate.id, profiles })
  }
  return discovery
}

/** Every server Tuff holds — imported or typed in — with both of its switches. */
export function mcpTuffEntries(items: AiImportedConfigItem[]): McpTuffEntry[] {
  const entries: McpTuffEntry[] = []
  for (const item of items) {
    if (item.kind !== 'mcp') continue
    for (const profile of mcpProfilesFromItem(item)) {
      const facts = factsFromStored(profile)
      if (!facts) continue
      const blockedReason =
        profile.metadata?.reauthRequired === true
          ? ('reauth-required' as const)
          : item.state === 'source-missing' || item.state === 'invalid'
            ? item.state
            : undefined
      const profileEnabled = profile.enabled !== false
      entries.push({
        facts,
        itemId: item.id,
        profileId: profile.id,
        origin: item.provider === 'manual' ? 'manual' : 'imported',
        provider: item.provider,
        itemActive: item.active,
        profileEnabled,
        blockedReason,
        running: item.active && item.state === 'active' && profileEnabled && !blockedReason,
        updatedAt: item.updatedAt
      })
    }
  }
  return entries
}

/**
 * The copy a row's switch acts on: the running one, else one that could run, newest first. A row
 * holding two copies (the same server imported from two agents) shows on while either runs.
 */
function primaryEntry(entries: McpTuffEntry[]): McpTuffEntry | undefined {
  return (
    entries.find((entry) => entry.running) ??
    [...entries].sort(
      (left, right) =>
        Number(Boolean(left.blockedReason)) - Number(Boolean(right.blockedReason)) ||
        right.updatedAt - left.updatedAt
    )[0]
  )
}

export function mcpTuffState(entries: McpTuffEntry[]): McpServerTuffState {
  const primary = primaryEntry(entries)
  if (!primary) return { state: 'not-imported' }
  const state: McpServerTuffState = {
    state: primary.running ? 'enabled' : 'disabled',
    itemId: primary.itemId,
    profileId: primary.profileId,
    origin: primary.origin,
    provider: primary.provider
  }
  if (!primary.running && primary.blockedReason) state.blockedReason = primary.blockedReason
  return state
}

interface RowDraft {
  facts: ServerFacts
  envNames: Set<string>
  headerNames: Set<string>
  hasSecrets: boolean
  agents: McpServerAgentSource[]
  tuff: McpTuffEntry[]
}

export function buildMcpServerInventory(input: {
  scanId: string
  discovery: McpDiscovery
  items: AiImportedConfigItem[]
}): McpServerInventory {
  const drafts = new Map<string, RowDraft>()
  const draftFor = (facts: ServerFacts): RowDraft => {
    let draft = drafts.get(facts.key)
    if (!draft) {
      draft = {
        facts,
        envNames: new Set(),
        headerNames: new Set(),
        hasSecrets: false,
        agents: [],
        tuff: []
      }
      drafts.set(facts.key, draft)
    }
    // Copies of one server can still name different variables (one agent sets an API key, another
    // does not); the detail lists every name any of them uses.
    for (const name of facts.detail.envNames) draft.envNames.add(name)
    for (const name of facts.detail.headerNames) draft.headerNames.add(name)
    draft.hasSecrets ||= facts.hasSecrets
    return draft
  }

  for (const file of input.discovery.files) {
    for (const profile of file.profiles) {
      const facts = factsFromConfig(profile)
      if (!facts) continue
      const draft = draftFor(facts)
      const source = {
        agentId: file.agentId,
        sourcePath: file.sourcePath,
        candidateId: file.candidateId
      }
      if (
        !draft.agents.some(
          (known) =>
            known.agentId === source.agentId &&
            known.sourcePath === source.sourcePath &&
            known.candidateId === source.candidateId
        )
      )
        draft.agents.push(source)
    }
  }
  for (const entry of mcpTuffEntries(input.items)) draftFor(entry.facts).tuff.push(entry)

  const rows: McpServerRow[] = [...drafts.values()]
    .map((draft) => ({
      key: draft.facts.key,
      name: draft.facts.name,
      transport: draft.facts.transport,
      summary: draft.facts.summary,
      detail: {
        ...draft.facts.detail,
        envNames: sortedUnique(draft.envNames),
        headerNames: sortedUnique(draft.headerNames)
      },
      hasSecrets: draft.hasSecrets,
      agents: draft.agents,
      tuff: mcpTuffState(draft.tuff)
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.summary.localeCompare(right.summary) ||
        left.key.localeCompare(right.key)
    )

  return {
    scanId: input.scanId,
    rows,
    agents: countAgentPresence(
      rows.map((row) => ({ agentIds: row.agents.map((agent) => agent.agentId) })),
      'mcp'
    ),
    unreadableSources: input.discovery.unreadable
  }
}

export interface McpServerSwitchDeps {
  listImportedItems: () => Promise<AiImportedConfigItem[]>
  /** One server of an imported item; the runtime is reconciled before it resolves. */
  setProfileEnabled: (itemId: string, profileId: string, enabled: boolean) => Promise<unknown>
  /** A hand-entered item holds one server, so its own switch is that server's. */
  setItemActive: (itemId: string, active: boolean) => Promise<unknown>
}

/**
 * Switches the server behind a row on or off, touching nothing else.
 *
 * On: if no copy of it runs yet, the newest copy that can run is switched on — one, so a server
 * imported from two agents does not start twice. Off: every copy that is switched on is switched
 * off, so the row cannot stay lit through a second copy. Either way the other servers of the same
 * configuration file keep the switches they had.
 *
 * A server Tuff does not hold yet is refused here: importing one server from a file goes through
 * the import path, which migrates its credentials only after the user confirms.
 */
export async function setMcpServerEnabled(
  deps: McpServerSwitchDeps,
  request: McpServerSetEnabledRequest
): Promise<McpServerTuffState> {
  const key = typeof request?.key === 'string' ? request.key : ''
  const enabled = request?.enabled === true
  const entries = mcpTuffEntries(await deps.listImportedItems()).filter(
    (entry) => entry.facts.key === key
  )
  if (entries.length === 0)
    throw new Error('MCP_SERVER_NOT_IMPORTED: Tuff holds no copy of this server yet')

  if (enabled) {
    if (!entries.some((entry) => entry.running)) {
      const target = [...entries]
        .filter((entry) => !entry.blockedReason)
        .sort((left, right) => right.updatedAt - left.updatedAt)[0]
      if (!target) {
        const reason = entries[0]!.blockedReason
        throw new Error(
          reason === 'reauth-required'
            ? 'MCP_SERVER_REAUTH_REQUIRED: the server needs its credentials re-entered'
            : reason === 'source-missing'
              ? "MCP_SERVER_SOURCE_MISSING: the agent's configuration no longer declares it"
              : 'MCP_SERVER_INVALID: the stored copy cannot run until it is imported again'
        )
      }
      if (target.origin === 'manual') await deps.setItemActive(target.itemId, true)
      else await deps.setProfileEnabled(target.itemId, target.profileId, true)
    }
  } else {
    for (const entry of entries) {
      if (entry.origin === 'manual') {
        if (entry.itemActive) await deps.setItemActive(entry.itemId, false)
      } else if (entry.profileEnabled) {
        await deps.setProfileEnabled(entry.itemId, entry.profileId, false)
      }
    }
  }

  return mcpTuffState(
    mcpTuffEntries(await deps.listImportedItems()).filter((entry) => entry.facts.key === key)
  )
}
