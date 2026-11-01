import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Timeline } from './timeline'

describe('Timeline', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stress-timeline-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes one JSON object per line, creating missing directories', async () => {
    const timeline = new Timeline(join(dir, 'deep', 'er', 'timeline.ndjson'))
    await timeline.open()
    timeline.write('tick', { t: 1, k: 'cpu', total: 12 })
    timeline.write('event', { t: 2, k: 'mark', label: 'batch:1' })
    await timeline.close()
    const lines = (await readFile(timeline.file, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(lines).toEqual([
      { t: 1, k: 'cpu', total: 12 },
      { t: 2, k: 'mark', label: 'batch:1' }
    ])
    expect(timeline.lines).toBe(2)
  })

  it('stops taking ticks at the cap but keeps room for events', async () => {
    const timeline = new Timeline(join(dir, 't.ndjson'), 200)
    await timeline.open()
    for (let index = 0; index < 50; index++)
      timeline.write('tick', { t: index, pad: 'x'.repeat(20) })
    const tickLines = timeline.lines
    expect(tickLines).toBeGreaterThan(0)
    expect(timeline.dropped).toBeGreaterThan(0)
    timeline.write('event', { t: 99, k: 'breach' })
    expect(timeline.lines).toBe(tickLines + 1)
    await timeline.close()
    const text = await readFile(timeline.file, 'utf8')
    expect(text.trim().split('\n')).toHaveLength(tickLines + 1)
  })

  it('ignores writes before open and after close, and close is repeatable', async () => {
    const timeline = new Timeline(join(dir, 't.ndjson'))
    timeline.write('tick', { t: 1 })
    expect(timeline.lines).toBe(0)
    await timeline.open()
    await timeline.close()
    timeline.write('tick', { t: 2 })
    await timeline.close()
    expect(timeline.lines).toBe(0)
  })

  it('appends to an existing file instead of truncating it', async () => {
    const first = new Timeline(join(dir, 't.ndjson'))
    await first.open()
    first.write('event', { t: 1 })
    await first.close()
    const second = new Timeline(join(dir, 't.ndjson'))
    await second.open()
    second.write('event', { t: 2 })
    await second.close()
    expect((await readFile(first.file, 'utf8')).trim().split('\n')).toHaveLength(2)
  })
})
