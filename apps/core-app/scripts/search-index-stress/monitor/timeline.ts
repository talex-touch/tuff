import { createWriteStream, type WriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024
const EVENT_HEADROOM_BYTES = 8 * 1024 * 1024

export type TimelineKind = 'tick' | 'event'

/**
 * Append-only NDJSON. Ticks stop at `maxBytes`; events (breaches, marks, phase changes) keep a
 * further 8 MiB, so a runaway run still ends with a readable record of what went wrong.
 */
export class Timeline {
  private stream: WriteStream | null = null
  private bytes = 0
  lines = 0
  dropped = 0

  constructor(
    readonly file: string,
    private readonly maxBytes = DEFAULT_MAX_BYTES
  ) {}

  async open(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    this.stream = createWriteStream(this.file, { flags: 'a' })
    this.stream.on('error', () => {
      this.stream = null
    })
  }

  write(kind: TimelineKind, record: Record<string, unknown>): void {
    if (!this.stream) return
    const limit = kind === 'tick' ? this.maxBytes : this.maxBytes + EVENT_HEADROOM_BYTES
    const line = `${JSON.stringify(record)}\n`
    if (this.bytes + line.length > limit) {
      this.dropped++
      return
    }
    this.bytes += line.length
    this.lines++
    this.stream.write(line)
  }

  close(): Promise<void> {
    const stream = this.stream
    this.stream = null
    if (!stream) return Promise.resolve()
    return new Promise((resolve) => stream.end(resolve))
  }
}
