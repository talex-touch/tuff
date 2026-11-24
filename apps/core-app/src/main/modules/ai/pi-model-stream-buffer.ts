import {
  advanceCodeFenceState,
  extractLeadingToolEnvelopes,
  isCodeFenceCloser,
  isJsonToolFenceOpener,
  isToolEnvelopeStart,
  parseJsonObject,
  parsePureToolEnvelopes,
  parseToolEnvelopeArray,
  readToolEnvelope,
  type CodeFenceState
} from './tool-text-protocol'

export interface PiModelStreamBufferOptions {
  /** Tool names offered in this model request, used to match trailing tool-call parsing. */
  toolNames?: ReadonlySet<string>
}

interface ContainerScanState {
  kind: 'object' | 'array'
  start: number
  cursor: number
  depth: number
  inString: boolean
  escaped: boolean
}

type FenceScanState =
  | { kind: 'fence-opener'; start: number }
  | {
      kind: 'fence-body'
      start: number
      fence: CodeFenceState
      bodyStart: number
      lineCursor: number
    }

type ActiveScanState = ContainerScanState | FenceScanState

interface TailState {
  acceptedCount: number
  lastValidEnd: number
  acceptedArray: boolean
  parseCursor: number
  active: ActiveScanState | null
}

function isWhitespaceChar(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
}

function findFirstNonWs(text: string, from: number): number {
  for (let i = from; i < text.length; i += 1) {
    if (!isWhitespaceChar(text[i])) return i
  }
  return -1
}

function isAtLineStart(text: string, pos: number): boolean {
  for (let i = pos - 1; i >= 0; i -= 1) {
    const ch = text[i]
    if (ch === '\n') return true
    if (ch !== ' ' && ch !== '\t' && ch !== '\r') return false
  }
  return true
}

/**
 * Checks whether an incomplete line fragment (no newline yet) can still become a valid bare or
 * `json` CommonMark fence opener line (e.g. ```` ``` ````, ```` ```json ````, `~~~json`).
 */
function couldBeJsonToolFenceOpener(fragment: string): boolean {
  const trimmed = fragment.trimStart()
  if (!trimmed) return true
  const first = trimmed[0]
  if (first !== '`' && first !== '~') return false
  let run = 0
  while (run < trimmed.length && trimmed[run] === first) run += 1
  if (run === trimmed.length) return true
  if (run < 3) return false
  const rest = trimmed.slice(run)
  if (first === '`' && rest.includes('`')) return false
  const restTrimmed = rest.trimStart().toLowerCase()
  if (!restTrimmed) return true
  if ('json'.startsWith(restTrimmed)) return true
  if (restTrimmed.startsWith('json')) {
    return restTrimmed.slice(4).trim().length === 0
  }
  return false
}

/**
 * Incrementally advances brace/bracket depth from `state.cursor` to the end of `buffer`, visiting
 * every character at most once across deltas. Returns the offset right after the closing delimiter,
 * or `-1` while the container is still open.
 */
function advanceContainerScan(buffer: string, state: ContainerScanState): number {
  const openChar = state.kind === 'object' ? '{' : '['
  const closeChar = state.kind === 'object' ? '}' : ']'
  for (let i = state.cursor; i < buffer.length; i += 1) {
    const ch = buffer[i]
    if (state.inString) {
      if (state.escaped) {
        state.escaped = false
      } else if (ch === '\\') {
        state.escaped = true
      } else if (ch === '"') {
        state.inString = false
      }
    } else if (ch === '"') {
      state.inString = true
    } else if (ch === openChar) {
      state.depth += 1
    } else if (ch === closeChar) {
      state.depth -= 1
      if (state.depth === 0) {
        state.cursor = i + 1
        return i + 1
      }
    }
  }
  state.cursor = buffer.length
  return -1
}

function createContainerScan(kind: 'object' | 'array', start: number): ContainerScanState {
  return {
    kind,
    start,
    cursor: start,
    depth: 0,
    inString: false,
    escaped: false
  }
}

function createTailState(): TailState {
  return {
    acceptedCount: 0,
    lastValidEnd: 0,
    acceptedArray: false,
    parseCursor: 0,
    active: null
  }
}

/**
 * Buffers model output stream chunks for Pi agent execution.
 *
 * Prevents internal pseudo-tool JSON directives (e.g. `{"type":"tool", ...}` — regardless of key
 * order, single or multiple, fenced, arrayed, or emitted on a new line after preamble prose) from
 * leaking into the user's conversation bubble as plain-text streaming deltas, while ensuring normal
 * conversation responses stream smoothly in real time.
 */
export class PiModelStreamBuffer {
  private streamMode: 'unknown' | 'tool' | 'text' = 'unknown'
  private leadingBuffer = ''
  private leadingScan: ActiveScanState | null = null
  private lineBuffer = ''
  private tailState: TailState | null = null
  private fenceState: CodeFenceState | null = null
  private emittedLine = ''
  private emittedLineCanBeFence = true
  private readonly toolNames?: ReadonlySet<string>

  constructor(
    private readonly onTextDelta: (delta: string) => void,
    options: PiModelStreamBufferOptions = {}
  ) {
    this.toolNames = options.toolNames
  }

  private emitText(text: string): void {
    if (!text) return
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i]
      if (ch === '\n') {
        if (this.emittedLineCanBeFence) {
          this.fenceState = advanceCodeFenceState(this.fenceState, this.emittedLine)
        }
        this.emittedLine = ''
        this.emittedLineCanBeFence = true
      } else if (this.emittedLineCanBeFence) {
        if (
          this.emittedLine.trim().length === 0 &&
          ch !== ' ' &&
          ch !== '\t' &&
          ch !== '\r' &&
          ch !== '`' &&
          ch !== '~'
        ) {
          this.emittedLineCanBeFence = false
        } else if (this.emittedLine.length < 512) {
          this.emittedLine += ch
        } else if (ch !== ' ' && ch !== '\t' && ch !== '\r') {
          if (ch === '`' || !this.emittedLine.endsWith('x')) {
            this.emittedLine += ch === '`' ? '`' : 'x'
          }
        }
      }
    }
    this.onTextDelta(text)
  }

  private enterTextMode(buffered: string): void {
    this.streamMode = 'text'
    this.leadingBuffer = ''
    this.leadingScan = null
    if (buffered) this.pushTextMode(buffered)
  }

  private enterToolMode(): void {
    this.streamMode = 'tool'
    this.leadingBuffer = ''
    this.leadingScan = null
  }

  private advanceLeadingScan(): void {
    const buf = this.leadingBuffer
    if (this.leadingScan === null) {
      const start = findFirstNonWs(buf, 0)
      if (start === -1) return
      const ch = buf[start]
      if (ch === '{') {
        this.leadingScan = createContainerScan('object', start)
      } else if (ch === '[') {
        this.leadingScan = createContainerScan('array', start)
      } else if (ch === '`' || ch === '~') {
        this.leadingScan = { kind: 'fence-opener', start }
      } else {
        this.enterTextMode(buf)
        return
      }
    }

    while (this.streamMode === 'unknown' && this.leadingScan !== null) {
      const scan: ActiveScanState = this.leadingScan
      if (scan.kind === 'object') {
        // Fast-path bare leading `{"type":"tool"` / `{"name":"...","type":"tool"` directives so
        // large truncated tool calls never accumulate unboundedly in memory.
        if (buf.length - scan.start >= 16) {
          const headSample = buf.slice(scan.start, scan.start + 160)
          if (isToolEnvelopeStart(headSample)) {
            this.enterToolMode()
            return
          }
        }

        const firstInner = findFirstNonWs(buf, scan.start + 1)
        if (firstInner !== -1 && buf[firstInner] !== '"' && buf[firstInner] !== '}') {
          this.enterTextMode(buf)
          return
        }

        const end = advanceContainerScan(buf, scan)
        if (end === -1) return

        const parsed = parseJsonObject(buf.slice(scan.start, end))
        if (
          parsed &&
          (readToolEnvelope(parsed) !== null ||
            (parsed.type === 'final' && typeof parsed.text === 'string'))
        ) {
          this.enterToolMode()
          return
        }
        this.enterTextMode(buf)
        return
      }

      if (scan.kind === 'array') {
        const firstInner = findFirstNonWs(buf, scan.start + 1)
        if (firstInner !== -1 && buf[firstInner] !== '{') {
          this.enterTextMode(buf)
          return
        }

        const end = advanceContainerScan(buf, scan)
        if (end === -1) return

        if (parseToolEnvelopeArray(buf.slice(scan.start, end)) !== null) {
          this.enterToolMode()
          return
        }
        this.enterTextMode(buf)
        return
      }

      if (scan.kind === 'fence-opener') {
        const nl = buf.indexOf('\n', scan.start)
        if (nl === -1) {
          if (!couldBeJsonToolFenceOpener(buf.slice(scan.start))) {
            this.enterTextMode(buf)
          }
          return
        }
        const fence = isJsonToolFenceOpener(buf.slice(scan.start, nl))
        if (!fence) {
          this.enterTextMode(buf)
          return
        }
        this.leadingScan = {
          kind: 'fence-body',
          start: scan.start,
          fence,
          bodyStart: nl + 1,
          lineCursor: nl + 1
        }
        continue
      }

      if (scan.kind !== 'fence-body') {
        return
      }
      const firstBody = findFirstNonWs(buf, scan.bodyStart)
      if (firstBody !== -1 && buf[firstBody] !== '{' && buf[firstBody] !== '[') {
        this.enterTextMode(buf)
        return
      }

      let cursor = scan.lineCursor
      let closeLineStart = -1
      while (cursor < buf.length) {
        const nl = buf.indexOf('\n', cursor)
        if (nl === -1) break
        const line = buf.slice(cursor, nl)
        if (isCodeFenceCloser(scan.fence, line)) {
          closeLineStart = cursor
          break
        }
        cursor = nl + 1
      }
      scan.lineCursor = cursor
      if (closeLineStart === -1) return

      const inner = buf.slice(scan.bodyStart, closeLineStart)
      if (parsePureToolEnvelopes(inner) !== null) {
        this.enterToolMode()
        return
      }
      const extracted = extractLeadingToolEnvelopes(inner)
      if (extracted.malformedTail) {
        this.enterToolMode()
        return
      }
      const parsedFinal = parseJsonObject(inner.trim())
      if (parsedFinal && parsedFinal.type === 'final' && typeof parsedFinal.text === 'string') {
        this.enterToolMode()
        return
      }
      // Mixed or ordinary fenced block: emit intact with opening and closing fences preserved.
      this.enterTextMode(buf)
      return
    }
  }

  private rejectTailAt(cutIndex: number): void {
    const raw = this.lineBuffer
    this.lineBuffer = ''
    this.tailState = null
    const head = raw.slice(0, cutIndex)
    const rest = raw.slice(cutIndex)
    if (head) this.emitText(head)
    if (rest) this.pushTextMode(rest)
  }

  private advanceTail(): void {
    while (this.tailState !== null) {
      const state = this.tailState
      const buf = this.lineBuffer

      if (state.active !== null) {
        const active: ActiveScanState = state.active
        if (active.kind === 'object' || active.kind === 'array') {
          const firstInner = findFirstNonWs(buf, active.start + 1)
          if (firstInner !== -1) {
            const ch = buf[firstInner]
            if (active.kind === 'object' && ch !== '"' && ch !== '}') {
              this.rejectTailAt(active.start + 1)
              return
            }
            if (active.kind === 'array' && ch !== '{') {
              this.rejectTailAt(active.start + 1)
              return
            }
          }

          const end = advanceContainerScan(buf, active)
          if (end === -1) return

          if (active.kind === 'object') {
            const parsed = parseJsonObject(buf.slice(active.start, end))
            const tool = parsed ? readToolEnvelope(parsed) : null
            const offered = tool !== null && (!this.toolNames || this.toolNames.has(tool.name))
            if (!offered) {
              this.rejectTailAt(end)
              return
            }
            state.acceptedCount += 1
            state.lastValidEnd = end
            state.parseCursor = end
            state.active = null
            continue
          }

          const calls = parseToolEnvelopeArray(buf.slice(active.start, end))
          const offered =
            calls !== null &&
            (!this.toolNames || calls.every((call) => this.toolNames!.has(call.name)))
          if (!offered) {
            this.rejectTailAt(end)
            return
          }
          state.acceptedCount += calls.length
          state.lastValidEnd = end
          state.acceptedArray = true
          state.parseCursor = end
          state.active = null
          continue
        }

        if (active.kind === 'fence-opener') {
          const nl = buf.indexOf('\n', active.start)
          if (nl === -1) {
            if (!couldBeJsonToolFenceOpener(buf.slice(active.start))) {
              this.rejectTailAt(buf.length)
            }
            return
          }
          const fence = isJsonToolFenceOpener(buf.slice(active.start, nl))
          if (!fence) {
            this.rejectTailAt(nl + 1)
            return
          }
          state.active = {
            kind: 'fence-body',
            start: active.start,
            fence,
            bodyStart: nl + 1,
            lineCursor: nl + 1
          }
          continue
        }

        if (active.kind !== 'fence-body') {
          return
        }
        const firstBody = findFirstNonWs(buf, active.bodyStart)
        if (firstBody !== -1 && buf[firstBody] !== '{' && buf[firstBody] !== '[') {
          this.rejectTailAt(active.bodyStart)
          return
        }

        let cursor = active.lineCursor
        let closeLineStart = -1
        let closeLineEnd = -1
        while (cursor < buf.length) {
          const nl = buf.indexOf('\n', cursor)
          if (nl === -1) break
          const line = buf.slice(cursor, nl)
          if (isCodeFenceCloser(active.fence, line)) {
            closeLineStart = cursor
            closeLineEnd = nl
            break
          }
          cursor = nl + 1
        }
        active.lineCursor = cursor
        if (closeLineEnd === -1) return

        const inner = buf.slice(active.bodyStart, closeLineStart)
        const calls = parsePureToolEnvelopes(inner, this.toolNames)
        if (!calls || calls.length === 0) {
          // Emit through the closing fence marker (before its newline) so `pushTextMode` closes
          // `fenceState` on that newline and immediately inspects the next line for trailing calls.
          this.rejectTailAt(closeLineEnd)
          return
        }
        state.acceptedCount += calls.length
        state.lastValidEnd = closeLineEnd
        state.parseCursor = closeLineEnd + 1
        state.active = null
        continue
      }

      // No active scan: advance across whitespace (and `,`/`;` separators between consecutive objects)
      let pos = state.parseCursor
      while (pos < buf.length && isWhitespaceChar(buf[pos])) pos += 1
      if (pos >= buf.length) {
        state.parseCursor = pos
        return
      }

      if (state.acceptedArray) {
        this.rejectTailAt(state.lastValidEnd)
        return
      }

      if (state.acceptedCount > 0 && (buf[pos] === ',' || buf[pos] === ';')) {
        pos += 1
        while (pos < buf.length && isWhitespaceChar(buf[pos])) pos += 1
        if (pos >= buf.length) {
          state.parseCursor = pos
          return
        }
      }

      const ch = buf[pos]
      if (ch === '{') {
        state.parseCursor = pos
        state.active = createContainerScan('object', pos)
        continue
      }
      if (ch === '[' && state.acceptedCount === 0) {
        state.parseCursor = pos
        state.active = createContainerScan('array', pos)
        continue
      }
      if ((ch === '`' || ch === '~') && isAtLineStart(buf, pos)) {
        state.parseCursor = pos
        state.active = { kind: 'fence-opener', start: pos }
        continue
      }

      const releaseUpTo = state.lastValidEnd > 0 ? state.lastValidEnd : pos
      this.rejectTailAt(releaseUpTo)
      return
    }
  }

  private pushTextMode(input: string): void {
    let delta = input
    while (delta.length > 0) {
      if (this.tailState !== null) {
        this.lineBuffer += delta
        delta = ''
        this.advanceTail()
        return
      }

      if (this.fenceState !== null) {
        const nl = delta.indexOf('\n')
        if (nl === -1) {
          this.emitText(delta)
          return
        }
        if (nl > 0) {
          this.emitText(delta.slice(0, nl))
        }
        // If this line closes the open markdown code fence, close the fence and hold the newline
        // so a standalone tool block on the very next line is recognized immediately.
        if (this.emittedLineCanBeFence && isCodeFenceCloser(this.fenceState, this.emittedLine)) {
          this.fenceState = null
          this.emittedLine = ''
          this.emittedLineCanBeFence = true
          this.lineBuffer = '\n'
          this.tailState = createTailState()
          delta = delta.slice(nl + 1)
          continue
        }
        this.emitText('\n')
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
      if (
        this.emittedLineCanBeFence &&
        advanceCodeFenceState(this.fenceState, this.emittedLine) !== null
      ) {
        this.emitText('\n')
      } else {
        this.lineBuffer = '\n'
        this.tailState = createTailState()
      }
      delta = delta.slice(nl + 1)
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

    this.leadingBuffer += delta
    this.advanceLeadingScan()
  }

  markTool(): void {
    this.streamMode = 'tool'
    this.leadingBuffer = ''
    this.leadingScan = null
    this.lineBuffer = ''
    this.tailState = null
  }

  flush(): void {
    if (this.leadingBuffer.length > 0) {
      const text = this.leadingBuffer
      this.leadingBuffer = ''
      this.leadingScan = null
      this.emitText(text)
    }
    if (this.lineBuffer.length > 0) {
      const text = this.lineBuffer
      this.lineBuffer = ''
      this.tailState = null
      this.emitText(text)
    }
  }

  complete(): void {
    if (this.streamMode === 'unknown' && this.leadingBuffer.length > 0) {
      const raw = this.leadingBuffer
      const trimmed = raw.trimStart()
      this.leadingBuffer = ''
      this.leadingScan = null

      const extracted = extractLeadingToolEnvelopes(trimmed)
      const parsedFinal = parseJsonObject(trimmed)
      const isLeadingToolOrFinal =
        parsePureToolEnvelopes(trimmed) !== null ||
        extracted.calls.length > 0 ||
        Boolean(extracted.malformedTail) ||
        Boolean(parsedFinal && parsedFinal.type === 'final' && typeof parsedFinal.text === 'string')

      if (isLeadingToolOrFinal) {
        this.streamMode = 'tool'
        return
      }

      this.streamMode = 'text'
      this.pushTextMode(raw)
    }

    if (this.streamMode === 'text' && this.lineBuffer.length > 0) {
      const raw = this.lineBuffer
      this.lineBuffer = ''
      this.tailState = null
      if (parsePureToolEnvelopes(raw, this.toolNames) === null) {
        this.emitText(raw)
      }
    }
  }
}
