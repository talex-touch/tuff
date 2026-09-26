/**
 * Where dictated words go in the composer's draft. Pure, so every rule is pinned by a test instead
 * of by a live microphone.
 *
 * `mergeTranscript` is the Assistant VoicePanel's `appendTranscriptText`, lifted out rather than
 * imported (that surface is its own `.vue`, under active change): providers disagree on whether a
 * partial is the whole hypothesis so far or only the newest fragment, and this rule takes either.
 */

/**
 * CJK punctuation, kana, Han, hangul, compatibility ideographs and the full-width forms: no space
 * goes next to these. Written as escapes so the ranges can be reviewed.
 */
const CJK = /[\u3000-\u303f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/

function lastChar(text: string): string {
  return Array.from(text).at(-1) ?? ''
}

function firstChar(text: string): string {
  return Array.from(text)[0] ?? ''
}

/** Whether two runs of text need a space between them to stay two words. */
function needsSpace(left: string, right: string): boolean {
  const last = lastChar(left)
  const first = firstChar(right)
  if (!last || !first) return false
  if (/\s/.test(last) || /\s/.test(first)) return false
  return !CJK.test(last) && !CJK.test(first)
}

/**
 * `incoming` merged onto `base`: a revision that extends the text replaces it, a repeat or a
 * shorter prefix changes nothing, an overlapping continuation is joined on the overlap, and
 * anything else is appended — with a space between Latin words and none next to CJK.
 */
export function mergeTranscript(base: string, incoming: string): string {
  const next = incoming.trim()
  if (!next) return base
  if (!base) return next
  if (next === base || next.startsWith(base)) return next
  if (base.startsWith(next)) return base

  const overlapLimit = Math.min(base.length, next.length)
  for (let size = overlapLimit; size > 0; size -= 1) {
    if (base.slice(-size) === next.slice(0, size)) return `${base}${next.slice(size)}`
  }

  return `${base}${needsSpace(base, next) ? ' ' : ''}${next}`
}

/**
 * A letter, a digit or an ideograph: something a person said. A capture of silence comes back as
 * punctuation alone — `。。。。。。。。。。` was the first partial, and in a silent session the final.
 */
const SPOKEN = /[\p{L}\p{N}]/u

/** The whitespace and sentence punctuation a recognizer leaves around a segment. */
const EDGES = /^[\s.。．!！?？,，、…~～]+|[\s.。．!！?？,，、…~～]+$/gu

/**
 * Subtitle credits that recognizers trained on video transcripts hear in room tone (Whisper-style
 * silence hallucinations; `(字幕:J Chong)` showed as a partial for ~0.7s). Each must be a whole
 * segment: the same words inside a sentence are speech, and stay.
 */
const SILENCE_HALLUCINATIONS: readonly RegExp[] = [
  // (字幕:J Chong)  （字幕：…）  [Subtitles by …]  【字幕…】 — half- and full-width brackets alike
  /^[(（[［【]\s*(?:字幕|subtitles?\b)[^)）\]］】]*[)）\]］】]$/iu,
  /^字幕由\s*amara\.org\s*社区提供$/iu,
  /^请不吝点赞[\s、，,]*订阅[\s、，,]*转发[\s、，,]*打赏支持明镜与点点栏目$/u,
  /^thanks?(?:\s+you)?\s+for\s+watching$/iu,
  /^subtitles\s+by\s+the\s+amara\.org\s+community$/iu
]

/**
 * A recognized segment as it may enter the draft: unchanged when it carries speech, `''` when the
 * recognizer made it out of silence — punctuation alone, or a whole known silence hallucination.
 */
export function spokenSegment(text: string): string {
  if (!SPOKEN.test(text)) return ''
  const core = text.replace(EDGES, '')
  return SILENCE_HALLUCINATIONS.some((pattern) => pattern.test(core)) ? '' : text
}

export interface DictationSplice {
  /** The draft from before the session, up to where the caret or selection started. */
  before: string
  /** The draft from before the session, after where the caret or selection ended. */
  after: string
  /** What has been said so far: committed finals merged with the live partial. */
  spoken: string
}

/**
 * The draft with `spoken` in place of the caret — or of the selection, exactly as typing would
 * replace it — and where the caret goes: the end of the inserted words.
 */
export function spliceDictation({ before, after, spoken }: DictationSplice): {
  text: string
  caret: number
} {
  const words = spoken.trim()
  if (!words) return { text: `${before}${after}`, caret: before.length }
  const head = `${before}${needsSpace(before, words) ? ' ' : ''}${words}`
  return {
    text: `${head}${needsSpace(words, after) ? ' ' : ''}${after}`,
    caret: head.length
  }
}
