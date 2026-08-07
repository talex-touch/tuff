import type {
  IntelligenceMessage,
  IntelligencePartEvent,
  IntelligenceProviderConfig,
  IntelligenceUsageInfo
} from '@talex-touch/tuff-intelligence'
import { constants } from 'node:fs'
import { access, readdir } from 'node:fs/promises'
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
 * replaces it either way; which variant applies depends on whether this spawn granted tools —
 * telling a model "you have no tools" while the allowlist hands it ten is how it politely writes
 * text substitutes instead of ever calling one.
 */
const PI_CLI_BASE_SYSTEM_PROMPT =
  'You are a helpful assistant embedded in the Talex Touch desktop app. ' +
  'Answer concisely and directly.'

export const PI_CLI_DEFAULT_SYSTEM_PROMPT = `${PI_CLI_BASE_SYSTEM_PROMPT} You have no tools available in this conversation.`

export const PI_CLI_TOOLS_SYSTEM_PROMPT =
  `${PI_CLI_BASE_SYSTEM_PROMPT} ` +
  'You have Tuff desktop tools available in this conversation. ' +
  'When the user asks for an interactive widget — a form to fill in, a chart — invoke the ' +
  'matching tuff_render_* tool instead of writing a text substitute. ' +
  'Announce it first: before invoking a render tool, write one short sentence in the ' +
  "user's language saying what you are about to generate, then call the tool. " +
  'After a render tool succeeds the widget is already on screen — do not repeat its ' +
  'contents as text; at most add one short follow-up sentence.'

const ROLE_LABELS: Record<IntelligenceMessage['role'], string> = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant'
}

/**
 * The model has no way to know the wall clock, and an unanchored guess ("today
 * is 2025-02-14") reads as a broken product. Lives on the base system prompt —
 * not in the Auto Context injection, which the user can switch off.
 */
function currentDateLine(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now)
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const offsetMinutes = -now.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  return (
    `Current date: ${weekday} ${date}, timezone ${timeZone} ` +
    `(UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}). ` +
    'Trust this over any internal assumption about the date.'
  )
}

/**
 * Cap on replayed transcript characters (≈24k tokens at the 4-chars/token
 * heuristic). The app owns history — every spawn is `--no-session` — so
 * nothing else bounds a long thread: pi's own compaction lives and dies
 * inside a single spawn. Oldest turns drop wholesale; the newest always
 * survives, even alone over budget.
 */
export const PI_CLI_TRANSCRIPT_CHAR_BUDGET = 96_000

/**
 * Once over budget, the cut advances in fixed chunks rather than per turn.
 * A cut anchored to the newest edge slides one turn forward on every send,
 * rewriting the transcript's head each time — and the provider's prompt
 * cache is a byte-exact prefix match, so that costs the whole cache on
 * every turn of a long thread. Quantizing the cut freezes the kept window
 * until ~a chunk of new turns has accumulated: one cache miss per chunk
 * instead of one per send.
 */
export const PI_CLI_TRANSCRIPT_DROP_CHUNK = 24_000

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
export function buildPiPrompt(
  messages: IntelligenceMessage[],
  options?: { toolsGranted?: boolean; now?: Date }
): PiCliPrompt {
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

  const base = options?.toolsGranted ? PI_CLI_TOOLS_SYSTEM_PROMPT : PI_CLI_DEFAULT_SYSTEM_PROMPT
  const stable = systemParts.length ? `${base}\n\n${systemParts.join('\n\n')}` : base
  // The one line that ever changes rides LAST: the provider's prompt cache is
  // a prefix match, so a day flip then invalidates only the system prompt's
  // tail — never the base prompt and imported rules the whole install shares.
  const systemPrompt = `${stable}\n\n${currentDateLine(options?.now ?? new Date())}`

  const latest = turns[turns.length - 1]
  // A single user turn needs no transcript framing; sending the bare text keeps the common case
  // identical to what the user typed.
  if (turns.length <= 1) {
    return { systemPrompt, prompt: latest?.content ?? '' }
  }

  // Chunk-quantized cut (see PI_CLI_TRANSCRIPT_DROP_CHUNK): the dropped
  // prefix is a pure function of turn sizes and the quantized excess, so it
  // is byte-identical across sends until the next chunk boundary. The guard
  // on `turns.length - 1` keeps the latest turn even alone over budget.
  const totalChars = turns.reduce((sum, turn) => sum + turn.content.length, 0)
  let dropped = 0
  if (totalChars > PI_CLI_TRANSCRIPT_CHAR_BUDGET) {
    const excess = totalChars - PI_CLI_TRANSCRIPT_CHAR_BUDGET
    const cutChars = Math.ceil(excess / PI_CLI_TRANSCRIPT_DROP_CHUNK) * PI_CLI_TRANSCRIPT_DROP_CHUNK
    let cut = 0
    while (dropped < turns.length - 1 && cut < cutChars) {
      cut += turns[dropped]!.content.length
      dropped += 1
    }
  }

  const kept = turns.slice(dropped, -1)
  const lines = kept.map((message) => `${ROLE_LABELS[message.role]}: ${message.content}`)
  if (dropped > 0) {
    // The model must know the thread is longer than what it sees — silence
    // here reads as "the conversation started at this point". No live count:
    // a number that ticked up per send would rewrite this line — and with it
    // the cached prefix of everything below.
    lines.unshift('[Earlier context omitted to fit the context window.]')
  }

  return {
    systemPrompt,
    prompt: `Conversation so far:\n\n${lines.join('\n\n')}\n\n---\n\nUser: ${latest?.content ?? ''}`
  }
}

export interface PiCliToolOptions {
  /**
   * Explicit tool allowlist. The application decides what the agent may
   * touch — this is never derived from pi's own defaults, and an empty or
   * missing list keeps the historical `--no-tools` behaviour.
   */
  tools?: string[]
  /**
   * Path to Tuff's own pi extension, loaded per spawn via `-e`. Explicit
   * loading is what lets `--no-extensions` stay unconditional: the user's
   * globally installed extensions never ride into the app's headless runs,
   * while the app's forwarder still registers (verified: `-e` loads even
   * under `--no-extensions` on pi 0.84).
   */
  extensionPath?: string
}

/**
 * Builds the argument vector for one run.
 *
 * `attachmentPaths` are files already written to disk by the caller; they become `pi`'s `@file`
 * positional arguments, which the CLI reads before the message that follows them
 * (`pi [options] [@files...] [messages...]`).
 */
export function buildPiArgs(
  prompt: PiCliPrompt,
  model?: string,
  toolOptions?: PiCliToolOptions,
  attachmentPaths: string[] = []
): string[] {
  const allowedTools = toolOptions?.tools?.filter((tool) => tool.trim()) ?? []
  const args = [
    '--print',
    '--mode',
    'json',
    // Without an explicit allowlist the home surface grants no tool permissions:
    // the agent must not be able to read, write or run anything on the user's
    // machine. With one, only the named tools are enabled — never pi's defaults.
    ...(allowedTools.length > 0 ? ['--tools', allowedTools.join(',')] : ['--no-tools']),
    // History is owned by the app; letting `pi` persist its own would create a second source of
    // truth that survives beyond the conversation the user can see.
    '--no-session',
    // Unconditional: the user's globally installed extensions must never ride
    // into the app's headless runs. Tuff's own tool forwarder is loaded
    // explicitly below — `-e` still honours the path under `--no-extensions`.
    '--no-extensions',
    ...(allowedTools.length > 0 && toolOptions?.extensionPath
      ? ['-e', toolOptions.extensionPath]
      : []),
    '--no-skills',
    // Without this, `pi` pulls AGENTS.md / CLAUDE.md from the working directory into a chat that has
    // nothing to do with the repository the app happens to be launched from.
    '--no-context-files',
    '--system-prompt',
    prompt.systemPrompt
  ]

  if (model) args.push('--model', model)
  for (const path of attachmentPaths) args.push(`@${path}`)
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
  /** Structured reasoning/tool event extracted from the agent loop. */
  partEvent?: IntelligencePartEvent
  /** One wire line can settle a whole tool call — start and input together. */
  partEvents?: IntelligencePartEvent[]
  /** How the assistant message that just ended settled: `stop`, `error`, `aborted`, … */
  stopReason?: string
  /** Why the run failed, in `pi`'s own words. Set by a failed message or a spent retry budget. */
  failure?: string
  /** Set on `auto_retry_start`, for the log line that records how often this happens. */
  retry?: { attempt: number; maxAttempts: number; delayMs: number }
}

/**
 * The two stop reasons that mean the message carried no answer. `pi` deletes such a message from
 * its own agent state before retrying, so text streamed under one of these is provisional even
 * though it already reached stdout.
 */
export function isFailedStopReason(stopReason: string | undefined): boolean {
  return stopReason === 'error' || stopReason === 'aborted'
}

/**
 * The settled tool call a `toolcall_end` update carries at its top level.
 *
 * This is the ONLY place on the JSON wire that names a tool call before its
 * result: the stdout protocol strips `partial` from every `message_update`
 * (`WithoutPartial` in pi's json-event layer), so `toolcall_start`/`_delta`
 * arrive as bare content indexes — an earlier reader that dug through
 * `partial.content[contentIndex]` returned null on every event and silently
 * dropped the whole tool lifecycle.
 */
function readToolCallEnd(
  record: PiJsonRecord
): { id: string; name: string; args?: unknown } | null {
  const toolCall = asRecord(record.toolCall)
  if (!toolCall) return null
  const id = readString(toolCall.id)
  const name = readString(toolCall.name)
  if (!id || !name) return null
  return { id, name, args: toolCall.arguments }
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
    if (!event) return null
    const eventType = readString(event.type)

    if (eventType === 'text_delta') {
      const delta = readString(event.delta)
      return delta ? { delta } : null
    }

    if (eventType === 'thinking_start') return { partEvent: { kind: 'reasoning-start' } }
    if (eventType === 'thinking_delta') {
      const delta = readString(event.delta)
      return delta ? { partEvent: { kind: 'reasoning-delta', delta } } : null
    }
    if (eventType === 'thinking_end') return { partEvent: { kind: 'reasoning-end' } }

    // `toolcall_start`/`toolcall_delta` carry only a content index on the
    // wire — nothing identifies the call until `toolcall_end` names it, so
    // the lifecycle begins there: the card appears with its input settled and
    // spends the execution window (end → toolResult) in its running state.
    if (eventType === 'toolcall_end') {
      const piece = readToolCallEnd(event)
      if (!piece) return null
      return {
        partEvents: [
          { kind: 'tool-start', callId: piece.id, name: piece.name },
          { kind: 'tool-input-end', callId: piece.id, input: piece.args }
        ]
      }
    }

    return null
  }

  // Session-level events ride the same stdout stream as message updates.
  // Auto-compaction is on by default in pi; dropping these left the user
  // blind to their context being squeezed mid-turn.
  if (type === 'compaction_start') {
    const reason = readString(record.reason)
    return { partEvent: { kind: 'compaction-start', ...(reason ? { reason } : {}) } }
  }
  if (type === 'compaction_end') {
    return { partEvent: { kind: 'compaction-end' } }
  }

  // Tool results arrive as their own message role; checked before the
  // assistant-metadata branch below, which ignores every other role.
  if (type === 'message_end') {
    const message = asRecord(record.message)
    if (message && readString(message.role) === 'toolResult') {
      const callId = readString(message.toolCallId)
      const name = readString(message.toolName)
      if (!callId || !name) return null
      const content = Array.isArray(message.content) ? message.content : []
      const output = content
        .map((piece) => {
          const text = asRecord(piece)
          return text && readString(text.type) === 'text' ? (readString(text.text) ?? '') : ''
        })
        .join('')
      return {
        partEvent: {
          kind: 'tool-result',
          callId,
          name,
          output,
          isError: message.isError === true
        }
      }
    }
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

    // Only `message_end` settles a message. `message_start` carries a `stopReason` too — `pending`
    // while the text streams, `aborted` on a run that already failed — and `turn_end` repeats the
    // one `message_end` just reported, so reading either would commit text mid-flight or count the
    // same failure twice.
    const stopReason = type === 'message_end' ? readString(message.stopReason) : undefined
    if (stopReason) {
      event.stopReason = stopReason
      if (isFailedStopReason(stopReason)) {
        const errorMessage = readString(message.errorMessage)
        if (errorMessage) event.failure = errorMessage
      } else {
        // `pi` kept this message, so the text streamed since the last commit is final. A tool loop
        // commits several times per turn, once per assistant message it settles.
        event.partEvent = { kind: 'message-commit' }
      }
    }

    return Object.keys(event).length ? event : null
  }

  // `pi` retries a failed turn inside the same process: it drops the abandoned assistant message
  // from its agent state and runs the prompt again, but the deltas it already wrote to stdout
  // cannot be recalled. Without this signal the next attempt's answer lands on top of the one pi
  // just threw away, and the user reads the same paragraph N times.
  if (type === 'auto_retry_start') {
    return {
      partEvent: { kind: 'text-reset' },
      retry: {
        attempt: readCount(record.attempt),
        maxAttempts: readCount(record.maxAttempts),
        delayMs: readCount(record.delayMs)
      }
    }
  }

  // The retry budget is spent. In `--mode json` this is the only place the reason surfaces: that
  // mode exits 0 whatever happened, so the exit code cannot stand in for it.
  if (type === 'auto_retry_end' && record.success !== true) {
    return { failure: readString(record.finalError) ?? 'pi exhausted its automatic retries' }
  }

  if (type === 'agent_settled') return { done: true }

  return null
}
