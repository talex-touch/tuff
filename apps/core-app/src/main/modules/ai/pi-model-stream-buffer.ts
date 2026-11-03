/**
 * Buffers model output stream chunks for Pi agent execution.
 *
 * Prevents internal pseudo-tool JSON directives (e.g. `{"type":"tool", ...}`)
 * from leaking into the user's conversation bubble as plain-text streaming deltas,
 * while ensuring normal conversation responses stream smoothly in real time.
 */
export class PiModelStreamBuffer {
  private bufferedDeltas: string[] = []
  private streamMode: 'unknown' | 'tool' | 'text' = 'unknown'

  constructor(private readonly onTextDelta: (delta: string) => void) {}

  pushDelta(delta: string): void {
    if (this.streamMode === 'text') {
      this.onTextDelta(delta)
      return
    }
    if (this.streamMode === 'tool') {
      return
    }

    this.bufferedDeltas.push(delta)
    const currentBuffered = this.bufferedDeltas.join('')
    const trimmedLeading = currentBuffered.trimStart()

    if (/^(?:```(?:json)?\s*)?\{\s*"type"\s*:\s*"(?:tool|final)"/i.test(trimmedLeading)) {
      this.streamMode = 'tool'
      this.bufferedDeltas = []
    } else if (
      trimmedLeading.length > 0 &&
      !trimmedLeading.startsWith('{') &&
      !trimmedLeading.startsWith('`')
    ) {
      this.streamMode = 'text'
      this.flush()
    } else if (trimmedLeading.length > 40) {
      this.streamMode = 'text'
      this.flush()
    }
  }

  markTool(): void {
    this.streamMode = 'tool'
    this.bufferedDeltas = []
  }

  flush(): void {
    if (this.bufferedDeltas.length === 0) return
    const text = this.bufferedDeltas.join('')
    this.bufferedDeltas = []
    this.onTextDelta(text)
  }

  complete(): void {
    if (this.streamMode === 'unknown' && this.bufferedDeltas.length > 0) {
      const currentBuffered = this.bufferedDeltas.join('')
      const trimmedLeading = currentBuffered.trimStart()
      if (!/^(?:```(?:json)?\s*)?\{\s*"type"\s*:\s*"(?:tool|final)"/i.test(trimmedLeading)) {
        this.flush()
      } else {
        this.bufferedDeltas = []
      }
    }
  }
}
