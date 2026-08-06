import type {
  IntelligenceMessage,
  IntelligenceProviderConfig,
  IntelligenceUsageInfo
} from '@talex-touch/tuff-intelligence'
import { access, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

export const PI_CLI_PROVIDER_ID = 'pi-cli-default'
export const PI_CLI_ORIGIN = 'pi-cli'

/**
 * `pi` ships its own credentials, so the provider has no key to fall back on. When the binary is
 * missing there is nothing to degrade to — the caller has to be told to install it or pick another
 * provider, which is why this is a distinct message rather than a generic spawn failure.
 */
export const PI_CLI_NOT_FOUND = 'PI_CLI_NOT_FOUND'

export function isPiCliProviderConfig(config: IntelligenceProviderConfig): boolean {
  return config.id === PI_CLI_PROVIDER_ID || config.metadata?.origin === PI_CLI_ORIGIN
}

// ============================================================================
// Executable discovery
// ============================================================================

/**
 * Version-manager roots that install `pi` outside any PATH entry Electron inherits. A GUI launch on
 * macOS gets `/usr/bin:/bin:/usr/sbin:/sbin` from launchd — none of these are in it, so searching
 * PATH alone finds nothing even when the CLI is installed and works in the user's terminal.
 */
function versionManagerRoots(home: string): string[] {
  return [
    join(home, '.local', 'share', 'mise', 'installs', 'node'),
    join(home, '.volta', 'tools', 'image', 'node'),
    join(home, '.nvm', 'versions', 'node'),
    join(home, '.fnm', 'node-versions')
  ]
}

/** Fixed directories that hold a `pi` binary directly, no version subdirectory in between. */
function directBinRoots(home: string): string[] {
  return [
    join(home, '.local', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.deno', 'bin'),
    join(home, '.npm-global', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ]
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function withPlatformExtensions(command: string): string[] {
  if (process.platform !== 'win32') return [command]
  const extensions = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
  return extensions.map((extension) => `${command}${extension}`)
}

async function findInDirectories(command: string, directories: string[]): Promise<string | null> {
  const names = withPlatformExtensions(command)
  for (const directory of directories) {
    for (const name of names) {
      const candidate = join(directory, name)
      if (await isExecutable(candidate)) return candidate
    }
  }
  return null
}

/**
 * Version managers nest binaries one level down (`installs/node/<version>/bin`). The versions are
 * read newest-first so a machine with several Node installs resolves to the most recently added one
 * rather than an abandoned old install that may not have `pi` at all.
 */
async function expandVersionedBinDirs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .map((version) => join(root, version, 'bin'))
  } catch {
    return []
  }
}

let cachedExecutable: string | null | undefined

/**
 * Resolves the `pi` binary, preferring an explicit override, then PATH, then the version-manager and
 * fixed roots. The result is cached because a miss walks several directories and the answer only
 * changes when the user installs or removes the CLI.
 */
export async function resolvePiExecutable(): Promise<string | null> {
  if (cachedExecutable !== undefined) return cachedExecutable

  const override = process.env.TUFF_PI_CLI_PATH?.trim()
  if (override) {
    cachedExecutable = (await isExecutable(override)) ? override : null
    return cachedExecutable
  }

  const pathDirectories = (process.env.PATH || '').split(delimiter).filter(Boolean)
  const fromPath = await findInDirectories('pi', pathDirectories)
  if (fromPath) {
    cachedExecutable = fromPath
    return cachedExecutable
  }

  const home = homedir()
  const versioned = await Promise.all(versionManagerRoots(home).map(expandVersionedBinDirs))
  const fallbackDirectories = [...versioned.flat(), ...directBinRoots(home)]

  cachedExecutable = await findInDirectories('pi', fallbackDirectories)
  return cachedExecutable
}

/** Test seam and install-time refresh: drops the memoised lookup so the next resolve re-scans. */
export function resetPiExecutableCache(): void {
  cachedExecutable = undefined
}

/**
 * Synchronous read of the memoised lookup, for callers that cannot await.
 *
 * `undefined` means "not probed yet" and is deliberately distinct from `null` ("probed, absent") —
 * config assembly runs on every invoke and must not treat an unprobed machine as one without the
 * CLI. Call {@link probePiCliAvailability} once at startup to settle it.
 */
export function getResolvedPiExecutable(): string | null | undefined {
  return cachedExecutable
}

export async function probePiCliAvailability(): Promise<boolean> {
  return Boolean(await resolvePiExecutable())
}

// ============================================================================
// Prompt construction
// ============================================================================

/**
 * `pi` defaults to a coding-assistant system prompt aimed at editing a repository. The home surface
 * is general chat with no tools granted, so that default would describe capabilities this provider
 * deliberately does not have.
 */
export const PI_CLI_DEFAULT_SYSTEM_PROMPT =
  'You are a helpful assistant embedded in the Talex Touch desktop app. ' +
  'Answer concisely and directly. You have no tools available in this conversation.'

const ROLE_LABELS: Record<IntelligenceMessage['role'], string> = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant'
}

export interface PiCliPrompt {
  systemPrompt: string
  prompt: string
}

/**
 * Flattens the turn history into one prompt.
 *
 * Positional arguments look like multi-turn input but are all recorded as *user* messages, so there
 * is no argument shape that can carry assistant turns back in. Reusing `pi`'s own session store
 * (`--session-id`) would carry them, at the cost of a second history that diverges from the app's
 * the moment a turn is stopped or retried.
 */
export function buildPiPrompt(messages: IntelligenceMessage[]): PiCliPrompt {
  const systemParts: string[] = []
  const turns: IntelligenceMessage[] = []

  for (const message of messages) {
    const content = message.content?.trim()
    if (!content) continue
    if (message.role === 'system') {
      systemParts.push(content)
      continue
    }
    turns.push({ ...message, content })
  }

  const systemPrompt = systemParts.length
    ? `${PI_CLI_DEFAULT_SYSTEM_PROMPT}\n\n${systemParts.join('\n\n')}`
    : PI_CLI_DEFAULT_SYSTEM_PROMPT

  const latest = turns[turns.length - 1]
  // A single user turn needs no transcript framing; sending the bare text keeps the common case
  // identical to what the user typed.
  if (turns.length <= 1) {
    return { systemPrompt, prompt: latest?.content ?? '' }
  }

  const history = turns
    .slice(0, -1)
    .map((message) => `${ROLE_LABELS[message.role]}: ${message.content}`)
    .join('\n\n')

  return {
    systemPrompt,
    prompt: `Conversation so far:\n\n${history}\n\n---\n\nUser: ${latest?.content ?? ''}`
  }
}

export function buildPiArgs(prompt: PiCliPrompt, model?: string): string[] {
  const args = [
    '--print',
    '--mode',
    'json',
    // The home surface grants no tool permissions, so the agent must not be able to read, write or
    // run anything on the user's machine.
    '--no-tools',
    // History is owned by the app; letting `pi` persist its own would create a second source of
    // truth that survives beyond the conversation the user can see.
    '--no-session',
    '--no-extensions',
    '--no-skills',
    // Without this, `pi` pulls AGENTS.md / CLAUDE.md from the working directory into a chat that has
    // nothing to do with the repository the app happens to be launched from.
    '--no-context-files',
    '--system-prompt',
    prompt.systemPrompt
  ]

  if (model) args.push('--model', model)
  args.push(prompt.prompt)
  return args
}

// ============================================================================
// NDJSON event parsing
// ============================================================================

interface PiJsonRecord {
  [key: string]: unknown
}

export interface PiCliEvent {
  delta?: string
  usage?: IntelligenceUsageInfo
  provider?: string
  model?: string
  done?: boolean
}

function asRecord(value: unknown): PiJsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as PiJsonRecord)
    : null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function parseUsage(value: unknown): IntelligenceUsageInfo | undefined {
  const usage = asRecord(value)
  if (!usage) return undefined

  const promptTokens = readCount(usage.input)
  const completionTokens = readCount(usage.output)
  const totalTokens = readCount(usage.totalTokens) || promptTokens + completionTokens
  // A settled turn always reports non-zero totals; an all-zero usage block means the run failed
  // before billing, and forwarding it would overwrite a real reading from an earlier event.
  if (!promptTokens && !completionTokens && !totalTokens) return undefined

  const cost = asRecord(usage.cost)
  const total = cost ? readCount(cost.total) : 0

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    ...(total > 0 ? { cost: total } : {})
  }
}

/**
 * Maps one NDJSON line onto the fields this provider forwards. Returns `null` for the many event
 * types the chat surface has no use for (`session`, `turn_start`, tool traffic, …) so the caller can
 * skip them without knowing the full `pi` event vocabulary.
 */
export function parsePiCliLine(line: string): PiCliEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // `pi` writes diagnostics to stderr, so a non-JSON line on stdout is noise rather than a signal
    // worth failing the whole turn over.
    return null
  }

  const record = asRecord(parsed)
  const type = record ? readString(record.type) : undefined
  if (!record || !type) return null

  if (type === 'message_update') {
    const event = asRecord(record.assistantMessageEvent)
    if (!event || readString(event.type) !== 'text_delta') return null
    const delta = readString(event.delta)
    return delta ? { delta } : null
  }

  if (type === 'message_start' || type === 'message_end' || type === 'turn_end') {
    const message = asRecord(record.message)
    if (!message || readString(message.role) !== 'assistant') return null
    const event: PiCliEvent = {}
    const provider = readString(message.provider)
    const model = readString(message.model)
    const usage = parseUsage(message.usage)
    if (provider) event.provider = provider
    if (model) event.model = model
    if (usage) event.usage = usage
    return Object.keys(event).length ? event : null
  }

  if (type === 'agent_settled') return { done: true }

  return null
}
