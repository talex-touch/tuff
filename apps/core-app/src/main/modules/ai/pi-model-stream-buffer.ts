import { extractLeadingToolEnvelopes, parsePureToolEnvelopes } from './tool-text-protocol'

export interface PiModelStreamBufferOptions {
  /** Tool names offered in this model request, used to match trailing tool-call parsing. */
  toolNames?: ReadonlySet<string>
}

const TOOL_OR_FINAL_PREFIX =
  /^(?:```(?:json)?\s+)?(?:\[\s*)?\{\s*(?:"type"\s*:\s*"(?:tool|final)"|"name"\s*:\s*"[^"]+"\s*,\s*"type"\s*:\s*"tool")/i

const TOOL_ONLY_PREFIX =
  /^(?:```(?:json)?\s+)?(?:\[\s*)?\{\s*(?:"type"\s*:\s*"tool"|"name"\s*:\s*"[^"]+"\s*,\s*"type"\s*:\s*"tool")/i

function matchesEnvelopePrefix(trimmed: string, allowFinal: boolean): boolean {
  return allowFinal ? TOOL_OR_FINAL_PREFIX.test(trimmed) : TOOL_ONLY_PREFIX.test(trimmed)
}

function isKeywordPrefix(fragment: string, keyword: string): boolean {
  return keyword.startsWith(fragment.toLowerCase())
}

function couldStartEnvelope(trimmed: string, allowFinal: boolean): boolean {
  if (!trimmed) return true
  if (matchesEnvelopePrefix(trimmed, allowFinal)) return true

  let rest = trimmed
  if (rest.startsWith('`')) {
    if (/^`{1,2}$/.test(rest)) return true
    if (!rest.startsWith('```')) return false
    const afterFence = rest.slice(3)
    const fenceOpen = afterFence.match(/^(?:json)?\s+/i)
    if (!fenceOpen) {
      return /^(?:j(?:s(?:o(?:n)?)?)?)?[ \t]*$/i.test(afterFence)
    }
    rest = afterFence.slice(fenceOpen[0].length).trimStart()
    if (!rest) return true
  }

  if (rest.startsWith('[')) {
    rest = rest.slice(1).trimStart()
    if (!rest) return true
  }

  if (!rest.startsWith('{') || rest.length > 120) return false

  const body = rest.slice(1).trimStart()
  if (!body) return true
  if (!body.startsWith('"')) return false

  const firstKeyClose = body.indexOf('"', 1)
  if (firstKeyClose === -1) {
    const partialKey = body.slice(1)
    return isKeywordPrefix(partialKey, 'type') || isKeywordPrefix(partialKey, 'name')
  }
  const firstKey = body.slice(1, firstKeyClose).toLowerCase()
  const afterKey = body.slice(firstKeyClose + 1).trimStart()
  if (!afterKey) return true
  if (!afterKey.startsWith(':')) return false
  const afterColon = afterKey.slice(1).trimStart()
  if (!afterColon) return true
  if (!afterColon.startsWith('"')) return false

  const firstValClose = afterColon.indexOf('"', 1)
  if (firstKey === 'type') {
    if (firstValClose === -1) {
      const partialVal = afterColon.slice(1)
      return (
        isKeywordPrefix(partialVal, 'tool') || (allowFinal && isKeywordPrefix(partialVal, 'final'))
      )
    }
    const val = afterColon.slice(1, firstValClose).toLowerCase()
    return val === 'tool' || (allowFinal && val === 'final')
  }

  if (firstKey === 'name') {
    if (firstValClose === -1) return !afterColon.slice(1).includes('\n')
    const afterVal = afterColon.slice(firstValClose + 1).trimStart()
    if (!afterVal) return true
    if (!afterVal.startsWith(',')) return false
    const afterComma = afterVal.slice(1).trimStart()
    if (!afterComma) return true
    if (!afterComma.startsWith('"')) return false
    const secondKeyClose = afterComma.indexOf('"', 1)
    if (secondKeyClose === -1) {
      return isKeywordPrefix(afterComma.slice(1), 'type')
    }
    if (afterComma.slice(1, secondKeyClose).toLowerCase() !== 'type') return false
    const afterSecondKey = afterComma.slice(secondKeyClose + 1).trimStart()
    if (!afterSecondKey) return true
    if (!afterSecondKey.startsWith(':')) return false
    const afterSecondColon = afterSecondKey.slice(1).trimStart()
    if (!afterSecondColon) return true
    if (!afterSecondColon.startsWith('"')) return false
    const secondValClose = afterSecondColon.indexOf('"', 1)
    if (secondValClose === -1) {
      return isKeywordPrefix(afterSecondColon.slice(1), 'tool')
    }
    return afterSecondColon.slice(1, secondValClose).toLowerCase() === 'tool'
  }

  return false
}

/**
 * Buffers model output stream chunks for Pi agent execution.
 *
 * Prevents internal pseudo-tool JSON directives (e.g. `{"type":"tool", ...}` — whether single,
 * multiple, fenced, arrayed, or emitted on a new line after preamble prose) from leaking into the
 * user's conversation bubble as plain-text streaming deltas, while ensuring normal conversation
 * responses stream smoothly in real time.
 */
export class PiModelStreamBuffer {
  private bufferedDeltas: string[] = []
  private streamMode: 'unknown' | 'tool' | 'text' = 'unknown'
  private lineBuffer = ''
  private holdingToolTail = false
  private inCodeFence = false
  private emittedLinePrefix = ''
  private readonly toolNames?: ReadonlySet<string>

  constructor(
    private readonly onTextDelta: (delta: string) => void,
    options: PiModelStreamBufferOptions = {}
  ) {
    this.toolNames = options.toolNames
  }

  private emitText(text: string): void {
    if (!text) return
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '\n') {
        if (/^\s*```/.test(this.emittedLinePrefix)) {
          this.inCodeFence = !this.inCodeFence
        }
        this.emittedLinePrefix = ''
      } else if (this.emittedLinePrefix.length < 16) {
        this.emittedLinePrefix += ch
      }
    }
    this.onTextDelta(text)
  }

  private releaseLineBuffer(trailingRest?: string): void {
    const raw = this.lineBuffer
    this.lineBuffer = ''
    this.holdingToolTail = false
    if (!raw) return

    if (trailingRest) {
      const restIndex = raw.lastIndexOf(trailingRest)
      if (restIndex > 0) {
        this.emitText(raw.slice(0, restIndex))
        this.pushTextMode(raw.slice(restIndex))
        return
      }
    }
    this.emitText(raw)
  }

  private tryReleaseNonToolTail(): void {
    const trimmed = this.lineBuffer.trimStart()
    if (!trimmed || trimmed.startsWith('[')) return

    const extracted = extractLeadingToolEnvelopes(trimmed)
    if (extracted.calls.length === 0) return

    const hasUnknownTool =
      this.toolNames !== undefined &&
      extracted.calls.some((call) => !this.toolNames!.has(call.name))

    if (hasUnknownTool) {
      this.releaseLineBuffer(extracted.rest || undefined)
      return
    }

    if (extracted.rest.length > 0) {
      const restAfterSep =
        extracted.rest.startsWith(',') || extracted.rest.startsWith(';')
          ? extracted.rest.slice(1).trimStart()
          : extracted.rest
      if (!couldStartEnvelope(restAfterSep, false)) {
        this.releaseLineBuffer(extracted.rest)
      }
    }
  }

  private pushTextMode(input: string): void {
    let delta = input
    if (this.holdingToolTail) {
      this.lineBuffer += delta
      this.tryReleaseNonToolTail()
      return
    }

    while (!this.holdingToolTail && delta.length > 0) {
      if (this.lineBuffer === '') {
        if (this.inCodeFence) {
          const nl = delta.indexOf('\n')
          if (nl === -1) {
            this.emitText(delta)
            return
          }
          this.emitText(delta.slice(0, nl + 1))
          delta = delta.slice(nl + 1)
          continue
        }

        const nl = delta.indexOf('\n')
        if (nl === -1) {
          this.emitText(delta)
          return
        }
        if (nl > 0) {
          this.emitText(delta.slice(0, nl))
        }
        if (/^\s*```/.test(this.emittedLinePrefix)) {
          this.emitText('\n')
        } else {
          this.lineBuffer = '\n'
        }
        delta = delta.slice(nl + 1)
        continue
      }

      if (this.lineBuffer.trim().length === 0) {
        const leadingWs = delta.match(/^\s*/)?.[0] ?? ''
        if (leadingWs) {
          this.lineBuffer += leadingWs
          delta = delta.slice(leadingWs.length)
        }
        if (!delta) return

        const firstChar = delta[0]
        if (firstChar !== '{' && firstChar !== '[' && firstChar !== '`') {
          this.emitText(this.lineBuffer)
          this.lineBuffer = ''
          continue
        }
      }

      this.lineBuffer += delta
      delta = ''

      const trimmed = this.lineBuffer.trimStart()
      if (matchesEnvelopePrefix(trimmed, false)) {
        this.holdingToolTail = true
        this.tryReleaseNonToolTail()
        return
      }
      if (couldStartEnvelope(trimmed, false)) {
        return
      }

      const contentOffset = this.lineBuffer.length - trimmed.length
      const nextNl = this.lineBuffer.indexOf('\n', contentOffset)
      if (nextNl !== -1) {
        const prefixLine = this.lineBuffer.slice(0, nextNl)
        const remainder = this.lineBuffer.slice(nextNl + 1)
        this.lineBuffer = ''
        if (/^```/.test(trimmed)) {
          this.emitText(prefixLine + '\n')
        } else {
          this.emitText(prefixLine)
          this.lineBuffer = '\n'
        }
        delta = remainder
        continue
      }

      this.emitText(this.lineBuffer)
      this.lineBuffer = ''
    }
  }

  pushDelta(delta: string): void {
    if (!delta) return
    if (this.streamMode === 'text') {
      this.pushTextMode(delta)
      return
    }
    if (this.streamMode === 'tool') {
      return
    }

    this.bufferedDeltas.push(delta)
    const currentBuffered = this.bufferedDeltas.join('')
    const trimmedLeading = currentBuffered.trimStart()

    if (matchesEnvelopePrefix(trimmedLeading, true)) {
      this.streamMode = 'tool'
      this.bufferedDeltas = []
    } else if (trimmedLeading.length > 0 && !couldStartEnvelope(trimmedLeading, true)) {
      this.streamMode = 'text'
      this.bufferedDeltas = []
      this.pushTextMode(currentBuffered)
    }
  }

  markTool(): void {
    this.streamMode = 'tool'
    this.bufferedDeltas = []
    this.lineBuffer = ''
    this.holdingToolTail = false
  }

  flush(): void {
    if (this.bufferedDeltas.length > 0) {
      const text = this.bufferedDeltas.join('')
      this.bufferedDeltas = []
      this.emitText(text)
    }
    if (this.lineBuffer.length > 0) {
      const text = this.lineBuffer
      this.lineBuffer = ''
      this.holdingToolTail = false
      this.emitText(text)
    }
  }

  complete(): void {
    if (this.streamMode === 'unknown' && this.bufferedDeltas.length > 0) {
      const currentBuffered = this.bufferedDeltas.join('')
      const trimmedLeading = currentBuffered.trimStart()
      this.bufferedDeltas = []
      if (!matchesEnvelopePrefix(trimmedLeading, true)) {
        this.streamMode = 'text'
        this.pushTextMode(currentBuffered)
      }
    }

    if (this.streamMode === 'text' && this.lineBuffer.length > 0) {
      const dropAsTrailingTool =
        this.holdingToolTail && parsePureToolEnvelopes(this.lineBuffer, this.toolNames) !== null
      if (!dropAsTrailingTool) {
        this.emitText(this.lineBuffer)
      }
      this.lineBuffer = ''
      this.holdingToolTail = false
    }
  }
}
