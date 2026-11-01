import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_MAX_PER_RUN, SAMPLE_MIN_GAP_MS, StallSampler, type SpawnSample } from './sample'
import { until } from './testing/manual-clock'

describe('StallSampler', () => {
  let dir: string
  let time: number

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stress-sample-'))
    time = Date.UTC(2026, 9, 30, 12, 34, 56, 789)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const make = (spawn: SpawnSample) =>
    new StallSampler({
      evidenceDir: join(dir, 'evidence'),
      mainPid: 4242,
      now: () => time,
      spawn,
      log: () => undefined
    })

  it('asks for a sample of the main pid into the evidence directory with a sortable name', async () => {
    const spawn = vi.fn<SpawnSample>(async (_pid, file) => {
      await writeFile(file, 'stack')
      return true
    })
    const sampler = make(spawn)
    const done = vi.fn()
    expect(sampler.request(done)).toBe(true)
    await sampler.settle()
    expect(spawn).toHaveBeenCalledOnce()
    const [pid, file] = spawn.mock.calls[0]
    expect(pid).toBe(4242)
    expect(basename(file)).toBe('stall-2026-10-30T12-34-56-789Z.sample.txt')
    expect(file.startsWith(join(dir, 'evidence'))).toBe(true)
    expect(done).toHaveBeenCalledWith(file)
  })

  it('never runs two captures at once', async () => {
    let release!: () => void
    const spawn = vi.fn<SpawnSample>(
      () => new Promise<boolean>((resolve) => (release = () => resolve(true)))
    )
    const sampler = make(spawn)
    expect(sampler.request(() => undefined)).toBe(true)
    await until(() => spawn.mock.calls.length === 1, 'the capture to start')
    time += SAMPLE_MIN_GAP_MS + 1
    expect(sampler.request(() => undefined)).toBe(false)
    release()
    await sampler.settle()
    expect(spawn).toHaveBeenCalledOnce()
  })

  it('waits the minimum gap between captures', async () => {
    const spawn = vi.fn<SpawnSample>(async () => true)
    const sampler = make(spawn)
    expect(sampler.request(() => undefined)).toBe(true)
    await sampler.settle()
    time += SAMPLE_MIN_GAP_MS - 1
    expect(sampler.request(() => undefined)).toBe(false)
    time += 1
    expect(sampler.request(() => undefined)).toBe(true)
    await sampler.settle()
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('stops after the per-run cap', async () => {
    const sampler = make(async () => true)
    let granted = 0
    for (let index = 0; index < SAMPLE_MAX_PER_RUN + 5; index++) {
      time += SAMPLE_MIN_GAP_MS
      if (sampler.request(() => undefined)) granted++
      await sampler.settle()
    }
    expect(granted).toBe(SAMPLE_MAX_PER_RUN)
    expect(sampler.count).toBe(SAMPLE_MAX_PER_RUN)
  })

  it('does not call back when the capture produced no file, and survives a throwing spawn', async () => {
    const none = vi.fn()
    const sampler = make(async () => false)
    sampler.request(none)
    await sampler.settle()
    expect(none).not.toHaveBeenCalled()

    time += SAMPLE_MIN_GAP_MS
    const boom = make(async () => {
      throw new Error('sample: not permitted')
    })
    expect(boom.request(none)).toBe(true)
    await expect(boom.settle()).resolves.toBeUndefined()
    expect(none).not.toHaveBeenCalled()
  })
})
