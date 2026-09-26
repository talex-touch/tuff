import type { StreamController } from '@talex-touch/utils/transport'
import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceStreamOptions
} from '@talex-touch/utils/types/intelligence'
import type { ComputedRef } from 'vue'
import type { ConversationRouting } from '~/modules/conversation/useHomeConversation'
import type { Translate } from '~/modules/lang/useI18nText'
import type { HomeSignals } from './signals'
import { INTELLIGENCE_HOME_OPENING_OPERATION } from '@talex-touch/utils/types/intelligence'
import { computed, ref } from 'vue'
import { buildHomeSummary, fingerprintHomeOpening } from './summary'
import { clipText, singleLine } from './text'

/**
 * The opening line of a blank Home conversation: two or three sentences the assistant says before
 * the user has typed anything, written by the model from a local summary.
 *
 * It runs on the composer's route, and that route can be a local CLI (Codex, Claude) that takes
 * ten-odd seconds to say anything. The skeleton cannot hold that long, so the local template
 * stands in for the rest of the wait and the model's opening takes its place once it is whole.
 *
 * ```
 * idle ──start──▶ pending ──first token──▶ streaming ──end──▶ done
 * idle ──start, the wait already spent on local reads──▶ fallback (no call is made)
 * pending ──2.5s──▶ interim (the template stands in; the call runs on, unseen)
 * interim ──the model's opening is whole──▶ done (it takes the template's place)
 * pending | interim ──30s / no provider / error──▶ fallback (the template, final; the call is cancelled)
 * streaming ──30s / error──▶ done (what arrived is kept) — or fallback, if nothing visible arrived
 * pending | interim | streaming ──cancel / takeLead──▶ cancelled (never joins the conversation)
 * ```
 *
 * A fallback is final: nothing a late stream says replaces the template once the wait is over.
 * Only a `done` opening becomes the conversation's first message ({@link HomeOpening.takeLead}).
 *
 * The model writes it only when the user turned it on (`appSetting.tools.homeAiOpening`, off by
 * default): each one is a call on their quota. Off, every start is the template, with no call.
 */

/** How long the skeleton waits for the first visible token before the template stands in. */
export const HOME_OPENING_SKELETON_MS = 2500
/**
 * How long, from entering the blank state, the model has to finish an opening: a local CLI on the
 * composer's route answers a chat turn in 15–30s, a short opening in less. Also the main-side
 * ceiling of the call (API providers honour it; a CLI is cancelled by this side).
 */
export const HOME_OPENING_WAIT_MS = 30_000
/** How long an opening is replayed for an unchanged summary instead of paying for a new one. */
export const HOME_OPENING_REUSE_WINDOW_MS = 10 * 60 * 1000
export const HOME_OPENING_MAX_SENTENCES = 3
export const HOME_OPENING_MAX_CODEPOINTS = 160

/** Streams only on the `chat` capability type — see `useHomeConversation`'s `CHAT_CAPABILITY_ID`. */
const OPENING_CAPABILITY_ID = 'text.chat'
const OPENING_TEMPERATURE = 0.7
/**
 * A cost ceiling, not the length limit: `sanitizeOpeningText` ends the visible opening at a
 * sentence stop within {@link HOME_OPENING_MAX_CODEPOINTS}, and the stream is cancelled once it
 * has. CJK runs up to two tokens a character, so a ceiling at the character limit would let an API
 * provider cut a Chinese opening mid-sentence first — and that cut text would show, be cached and
 * join the thread.
 */
const OPENING_MAX_TOKENS = 2 * HOME_OPENING_MAX_CODEPOINTS

// ---------------------------------------------------------------------------
// Text shaping
// ---------------------------------------------------------------------------

const HARD_STOPS = new Set(['。', '！', '？', '!', '?'])
/** A period or an ellipsis only ends a sentence before whitespace: `3.5`, `e.g` and `……要不` do not. */
const SOFT_STOPS = new Set(['.', '…'])
/** Closing marks that belong to the sentence they end. */
const CLOSERS = new Set(['"', "'", '”', '’', '」', '』', '》', ')', '）', ']', '】'])
const WRAPPING_QUOTES: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ['“', '”'],
  ['「', '」'],
  ['『', '』'],
  ["'", "'"],
  ['‘', '’']
]

/** CJK ideographs and punctuation, and full-width forms: scripts that set no space between words. */
const WIDE_CHAR = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/

function isWide(char: string | undefined): boolean {
  return char !== undefined && WIDE_CHAR.test(char)
}

/**
 * One paragraph. A line break between two CJK sentences disappears; between Latin words it becomes
 * a space; every other whitespace run collapses to one space.
 */
function flattenWhitespace(raw: string): string {
  return raw
    .replace(/\s*\n\s*/g, (match: string, offset: number, whole: string) => {
      const before = whole[offset - 1]
      const after = whole[offset + match.length]
      return before !== undefined && after !== undefined && !isWide(before) && !isWide(after)
        ? ' '
        : ''
    })
    .replace(/\s+/g, ' ')
}

/** Emphasis and a leading block marker — the prompt asks for plain prose, models still decorate. */
function stripMarkdown(text: string): string {
  return text.replace(/\*\*|__|`/g, '').replace(/^(?:#{1,6}\s+|[-*>]\s+)/, '')
}

/** A reply wrapped whole in one pair of quotes loses them; a quoted title inside it does not. */
function unwrapQuotes(text: string): string {
  for (const [open, close] of WRAPPING_QUOTES) {
    if (text.length <= open.length + close.length) continue
    if (!text.startsWith(open) || !text.endsWith(close)) continue
    const inner = text.slice(open.length, text.length - close.length)
    if (!inner.includes(open) && !inner.includes(close)) return inner.trim()
  }
  return text
}

/** End offsets (exclusive, UTF-16) of every complete sentence in `text`. */
function sentenceEnds(text: string, final: boolean): number[] {
  const ends: number[] = []
  let index = 0
  while (index < text.length) {
    const char = text[index]!
    const hard = HARD_STOPS.has(char)
    if (!hard && !SOFT_STOPS.has(char)) {
      index += 1
      continue
    }
    let end = index + 1
    while (end < text.length && (HARD_STOPS.has(text[end]!) || SOFT_STOPS.has(text[end]!))) {
      end += 1
    }
    while (end < text.length && CLOSERS.has(text[end]!)) end += 1
    // A soft stop at the very end of a still-streaming text may yet turn out to be `3.` of `3.5`.
    if (hard || (end < text.length ? /\s/.test(text[end]!) : final)) ends.push(end)
    index = end
  }
  return ends
}

function codePointLength(value: string): number {
  return [...value].length
}

export interface OpeningTextShape {
  text: string
  /**
   * The text reached a limit — a fourth sentence started, or it outgrew
   * {@link HOME_OPENING_MAX_CODEPOINTS} — and was cut back to a sentence end. Nothing the stream
   * says after this point can show, so the caller stops paying for it.
   */
  complete: boolean
}

/**
 * Shapes model output into the opening as it will read: one paragraph, no Markdown, at most
 * {@link HOME_OPENING_MAX_SENTENCES} sentences and {@link HOME_OPENING_MAX_CODEPOINTS} characters,
 * cut at a sentence end. `final` is the finished text: only then are wrapping quotes removed and a
 * trailing period counted as a sentence end.
 */
export function sanitizeOpeningText(
  raw: string,
  options: { final?: boolean } = {}
): OpeningTextShape {
  const final = options.final === true
  let text = stripMarkdown(flattenWhitespace(raw).trimStart())
  if (final) text = unwrapQuotes(text.trim())

  let complete = false
  const ends = sentenceEnds(text, final)
  const lastAllowed = ends[HOME_OPENING_MAX_SENTENCES - 1]
  if (lastAllowed !== undefined && text.slice(lastAllowed).trim()) {
    text = text.slice(0, lastAllowed)
    complete = true
  }

  if (codePointLength(text) > HOME_OPENING_MAX_CODEPOINTS) {
    const fitting = ends.filter(
      (end) =>
        end <= text.length && codePointLength(text.slice(0, end)) <= HOME_OPENING_MAX_CODEPOINTS
    )
    const cut = fitting[fitting.length - 1]
    text = cut !== undefined ? text.slice(0, cut) : clipText(text, HOME_OPENING_MAX_CODEPOINTS)
    complete = true
  }

  return { text: text.trim(), complete }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface HomeOpeningRequest {
  /** Model-facing instruction, from the renderer catalog. */
  prompt: string
  /** Model-facing local summary (`buildHomeSummary`). Never carries clipboard text. */
  summary: string
  /** Reuse key: the same fingerprint inside the reuse window replays the last opening. */
  fingerprint: string
  /** The local template shown when the model cannot answer in time. */
  fallback: string
}

/**
 * The template opening: which sentence depends on what the signals hold, and every word of it comes
 * from the catalog.
 *
 * The active project wins — a project's blank conversation is centred on that project — then the
 * most recent conversation, then a resumable local session, then the plain introduction.
 */
export function resolveTemplateOpening(signals: HomeSignals, t: Translate): string {
  const title = (value: string): string => clipText(singleLine(value), 24)
  const name = (value: string): string => clipText(singleLine(value), 32)
  const project = signals.activeProject
  if (project?.name) {
    const inProject = signals.recentConversations.find(
      (conversation) => conversation.projectId === project.id && conversation.title
    )
    return inProject
      ? t('home.opening.template.projectConversation', {
          project: name(project.name),
          title: title(inProject.title)
        })
      : t('home.opening.template.project', { project: name(project.name) })
  }
  const recent = signals.recentConversations.find((conversation) => conversation.title)
  if (recent) return t('home.opening.template.conversation', { title: title(recent.title) })
  const session = signals.sessions[0]
  if (session) {
    return session.projectName
      ? t('home.opening.template.sessionInProject', {
          provider: session.provider,
          project: name(session.projectName)
        })
      : t('home.opening.template.session', { provider: session.provider })
  }
  return t('home.opening.template.default')
}

/** Everything one opening call needs, in the reader's locale. */
export function buildHomeOpeningRequest(signals: HomeSignals, t: Translate): HomeOpeningRequest {
  const prompt = t('home.opening.prompt')
  const summary = buildHomeSummary(signals, t)
  return {
    prompt,
    summary,
    fingerprint: fingerprintHomeOpening(prompt, summary),
    fallback: resolveTemplateOpening(signals, t)
  }
}

/**
 * The system note an opening becomes once it is the conversation's first message, for
 * `useHomeConversation`'s `leadNote` option. Every turn after it tells the model what it already
 * said, in the reader's locale.
 */
export function createOpeningLeadNote(t: Translate): (text: string) => string {
  return (text) => t('home.opening.leadNote', { text })
}

function toOpeningPayload(request: HomeOpeningRequest): IntelligenceChatPayload {
  return {
    messages: [
      { role: 'system', content: request.prompt },
      { role: 'user', content: request.summary }
    ],
    temperature: OPENING_TEMPERATURE,
    maxTokens: OPENING_MAX_TOKENS
  }
}

/**
 * The route every chat turn takes — the composer's pinned provider and model, or auto — and
 * nothing else of a chat turn: no surface marker, so main injects no skills and opens no native CLI
 * session (an opening happens before the conversation has an id), and no reasoning effort, so two
 * sentences of greeting run at the route's own default rather than at the composer's 「高」.
 */
function toOpeningInvokeOptions(
  routing: ConversationRouting | undefined
): IntelligenceInvokeOptions {
  return {
    ...(routing?.providerId ? { preferredProviderId: routing.providerId } : {}),
    ...(routing?.model ? { modelPreference: [routing.model] } : {}),
    timeout: HOME_OPENING_WAIT_MS,
    metadata: { operation: INTELLIGENCE_HOME_OPENING_OPERATION }
  }
}

// ---------------------------------------------------------------------------
// Reuse cache
// ---------------------------------------------------------------------------

export interface HomeOpeningCacheEntry {
  fingerprint: string
  text: string
  /** When the opening was generated — reuse never extends the window. */
  at: number
}

export interface HomeOpeningCache {
  read: () => HomeOpeningCacheEntry | null
  write: (entry: HomeOpeningCacheEntry) => void
  clear: () => void
}

/** One entry: the last model opening. Memory only — an opening is never persisted on its own. */
export function createHomeOpeningCache(): HomeOpeningCache {
  let entry: HomeOpeningCacheEntry | null = null
  return {
    read: () => entry,
    write: (next) => {
      entry = { ...next }
    },
    clear: () => {
      entry = null
    }
  }
}

/** Module-wide, so reopening Home within the window reuses the opening whatever mounted it. */
const sharedHomeOpeningCache = createHomeOpeningCache()

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/** `interim`: the template is on screen while the model's opening is still being written. */
export type HomeOpeningPhase =
  | 'idle'
  | 'pending'
  | 'streaming'
  | 'interim'
  | 'done'
  | 'fallback'
  | 'cancelled'
/** Where the text on screen came from. */
export type HomeOpeningSource = 'model' | 'cache' | 'template'

/** The slice of the intelligence SDK an opening needs; `useIntelligenceSdk()` satisfies it. */
export interface HomeOpeningSdk {
  stream: (
    capabilityId: string,
    payload: IntelligenceChatPayload,
    options: IntelligenceStreamOptions<string>,
    invokeOptions?: IntelligenceInvokeOptions
  ) => Promise<StreamController>
}

export interface CreateHomeOpeningOptions {
  sdk: HomeOpeningSdk
  /**
   * The composer's route, read as each opening starts: the same getter the conversation's chat
   * turns read (`useHomeConversation`'s `routing`). Absent or empty is auto.
   */
  routing?: () => ConversationRouting | undefined
  /** Whether the model may write the opening, read as each one starts. Absent is on. */
  enabled?: () => boolean
  /** Defaults to the module-wide cache. */
  cache?: HomeOpeningCache
  now?: () => number
  skeletonMs?: number
  waitMs?: number
  reuseWindowMs?: number
}

export interface HomeOpeningStartOptions {
  /**
   * When the reader started waiting — entering the blank state, before the local data was read.
   * Both waits count from here, so preparing the summary does not extend them.
   */
  startedAt?: number
}

export interface HomeOpening {
  phase: ComputedRef<HomeOpeningPhase>
  text: ComputedRef<string>
  source: ComputedRef<HomeOpeningSource | null>
  /** Starts (or replays from the cache) the opening for a blank conversation, replacing any other. */
  start: (request: HomeOpeningRequest, options?: HomeOpeningStartOptions) => void
  /** Leaving the blank state: an opening still in flight is dropped. A settled one stays as it is. */
  cancel: () => void
  /**
   * Called as the first message is sent. Returns a finished model opening (`done`), once, for the
   * conversation to keep as its first assistant message. One still pending or streaming is
   * cancelled instead and returns null; a template (`fallback`) returns null — the model never
   * said it.
   */
  takeLead: () => string | null
  dispose: () => void
}

interface OpeningCall {
  request: HomeOpeningRequest
  raw: string
  controller: StreamController | null
  /** Ends the skeleton: the template stands in. Cleared by the first visible token. */
  skeletonTimer: ReturnType<typeof setTimeout> | null
  /** Ends the wait: whatever is on screen then is the opening. */
  deadlineTimer: ReturnType<typeof setTimeout> | null
  /** Set once the result no longer matters; a controller arriving later is cancelled on arrival. */
  released: boolean
  /** The stream ended on its own (end or error): cancelling it now would be a no-op at best. */
  ended: boolean
  cancelled: boolean
}

export function createHomeOpening(options: CreateHomeOpeningOptions): HomeOpening {
  const cache = options.cache ?? sharedHomeOpeningCache
  const now = options.now ?? (() => Date.now())
  const skeletonMs = options.skeletonMs ?? HOME_OPENING_SKELETON_MS
  const waitMs = options.waitMs ?? HOME_OPENING_WAIT_MS
  const reuseWindowMs = options.reuseWindowMs ?? HOME_OPENING_REUSE_WINDOW_MS

  const phase = ref<HomeOpeningPhase>('idle')
  const text = ref('')
  const source = ref<HomeOpeningSource | null>(null)
  /** The call whose events may still change what is on screen. Every handler checks it first. */
  let current: OpeningCall | null = null
  let leadTaken = false

  function show(
    nextPhase: HomeOpeningPhase,
    nextText: string,
    nextSource: HomeOpeningSource | null
  ): void {
    phase.value = nextPhase
    text.value = nextText
    source.value = nextSource
  }

  function clearSkeletonTimer(call: OpeningCall): void {
    if (call.skeletonTimer === null) return
    clearTimeout(call.skeletonTimer)
    call.skeletonTimer = null
  }

  function clearTimers(call: OpeningCall): void {
    clearSkeletonTimer(call)
    if (call.deadlineTimer === null) return
    clearTimeout(call.deadlineTimer)
    call.deadlineTimer = null
  }

  function cancelStream(call: OpeningCall): void {
    if (call.ended || call.cancelled || !call.controller) return
    call.cancelled = true
    call.controller.cancel()
  }

  /** Lets go of a call: no timer, no stream, and no handler of it touches the screen again. */
  function release(call: OpeningCall): void {
    clearTimers(call)
    call.released = true
    cancelStream(call)
    if (current === call) current = null
  }

  function useTemplate(call: OpeningCall): void {
    release(call)
    show('fallback', call.request.fallback, 'template')
  }

  /**
   * Ends a call that produced text. `cacheable` is false for an opening an error cut short: it can
   * stand for this conversation, but it is not worth replaying for the next ten minutes.
   */
  function settle(call: OpeningCall, cacheable: boolean): void {
    const finalText = sanitizeOpeningText(call.raw, { final: true }).text
    release(call)
    if (!finalText) {
      show('fallback', call.request.fallback, 'template')
      return
    }
    show('done', finalText, 'model')
    if (cacheable)
      cache.write({ fingerprint: call.request.fingerprint, text: finalText, at: now() })
  }

  /**
   * The stream failed or never started: keep what showed of it, if anything did. While the template
   * stands in, a cut-short opening does not replace it — the template stays, for good.
   */
  function fail(call: OpeningCall): void {
    call.ended = true
    if (phase.value === 'streaming') settle(call, false)
    else useTemplate(call)
  }

  function start(request: HomeOpeningRequest, startOptions: HomeOpeningStartOptions = {}): void {
    if (current) release(current)
    leadTaken = false

    // Turned off: the template, and no call — not even a replay of one the model wrote earlier.
    if (options.enabled?.() === false) {
      show('fallback', request.fallback, 'template')
      return
    }

    const cached = cache.read()
    if (cached && cached.fingerprint === request.fingerprint && now() - cached.at < reuseWindowMs) {
      show('done', cached.text, 'cache')
      return
    }

    const waited =
      startOptions.startedAt === undefined ? 0 : Math.max(0, now() - startOptions.startedAt)
    const deadlineMs = waitMs - waited
    // The reader already waited out the whole wait on the local reads: the template is the answer,
    // and a call started now would only be paid for and cancelled on arrival.
    if (deadlineMs <= 0) {
      show('fallback', request.fallback, 'template')
      return
    }
    const skeletonLeftMs = skeletonMs - waited

    const call: OpeningCall = {
      request,
      raw: '',
      controller: null,
      skeletonTimer: null,
      deadlineTimer: null,
      released: false,
      ended: false,
      cancelled: false
    }
    current = call
    if (skeletonLeftMs > 0) {
      show('pending', '', null)
      call.skeletonTimer = setTimeout(() => {
        call.skeletonTimer = null
        if (current === call && phase.value === 'pending') {
          show('interim', request.fallback, 'template')
        }
      }, skeletonLeftMs)
    } else {
      show('interim', request.fallback, 'template')
    }
    call.deadlineTimer = setTimeout(() => {
      call.deadlineTimer = null
      if (current !== call) return
      if (phase.value === 'streaming') settle(call, false)
      else useTemplate(call)
    }, deadlineMs)

    const handlers: IntelligenceStreamOptions<string> = {
      onDelta: (delta) => {
        if (current !== call || !delta) return
        call.raw += delta
        const shaped = sanitizeOpeningText(call.raw)
        // A delta of whitespace or bare Markdown is not the first token: the skeleton stays.
        if (!shaped.text) return
        // The template is on screen: the model's words wait off it until the opening is whole, so
        // the reader sees one swap rather than a sentence growing over the template.
        if (phase.value === 'interim') {
          if (shaped.complete) settle(call, true)
          return
        }
        if (phase.value === 'pending') {
          clearSkeletonTimer(call)
          phase.value = 'streaming'
          source.value = 'model'
        }
        if (shaped.complete) {
          settle(call, true)
          return
        }
        text.value = shaped.text
      },
      onEnd: () => {
        if (current !== call) return
        call.ended = true
        settle(call, true)
      },
      onError: () => {
        if (current !== call) return
        fail(call)
      }
    }

    let started: Promise<StreamController>
    try {
      started = options.sdk.stream(
        OPENING_CAPABILITY_ID,
        toOpeningPayload(request),
        handlers,
        toOpeningInvokeOptions(options.routing?.())
      )
    } catch (error) {
      started = Promise.reject(error)
    }
    // No non-streaming retry when the stream cannot start: an opening is not worth a second bill,
    // and the template is already the designed answer to "no provider".
    void started.then(
      (controller) => {
        call.controller = controller
        // Let go while the handshake was in flight — timed out, left, sent, or finished early.
        if (call.released) cancelStream(call)
      },
      () => {
        if (current !== call) return
        fail(call)
      }
    )
  }

  function cancel(): void {
    const call = current
    if (!call) return
    release(call)
    show('cancelled', '', null)
  }

  function takeLead(): string | null {
    if (current) {
      cancel()
      return null
    }
    if (phase.value !== 'done' || leadTaken) return null
    leadTaken = true
    return text.value
  }

  return {
    phase: computed(() => phase.value),
    text: computed(() => text.value),
    source: computed(() => source.value),
    start,
    cancel,
    takeLead,
    dispose: cancel
  }
}
