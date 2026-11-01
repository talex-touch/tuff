import { describe, expect, it } from 'vitest'
import { createCpuSampler, createProgress, parseCpuTime } from './progress'
import { createVirtualClock } from './test-support/virtual-clock'

describe('createProgress', () => {
  it('shows phase, share done, rate, estimate, results and pressure', async () => {
    const clock = createVirtualClock()
    const progress = createProgress(clock)
    progress.setPhase('steady')
    progress.setTotal(200)
    for (const outcome of ['pass', 'pass', 'fail', 'error', 'skipped'] as const)
      progress.check(outcome)
    for (let i = 0; i < 20; i += 1) {
      await clock.advance(3_000)
      progress.scenarioSettled()
    }
    const line = progress.line({ pressure: 'elevated', cpuPct: 83.4, inflight: 6 })
    expect(line).toContain('steady 20/200 (10%)')
    expect(line).toContain('20.0/min')
    expect(line).toContain('eta 9m')
    expect(line).toContain('pass 2 fail 1 err 1 skip 1')
    expect(line).toContain('in flight 6')
    expect(line).toContain('pressure elevated')
    expect(line).toContain('app cpu 83%')
  })

  it('measures the rate over the last minute, not the whole run', async () => {
    const clock = createVirtualClock()
    const progress = createProgress(clock)
    progress.setTotal(1_000)
    for (let i = 0; i < 100; i += 1) {
      await clock.advance(100)
      progress.scenarioSettled()
    }
    await clock.advance(10 * 60_000)
    for (let i = 0; i < 6; i += 1) {
      await clock.advance(10_000)
      progress.scenarioSettled()
    }
    expect(progress.line({ pressure: 'ok', cpuPct: null })).toContain('6.0/min')
  })

  it('has no estimate before anything finished and prints ? for unknown CPU', () => {
    const progress = createProgress(createVirtualClock())
    progress.setTotal(10)
    const line = progress.line({ pressure: 'ok', cpuPct: null })
    expect(line).not.toContain('eta')
    expect(line).toContain('app cpu ?')
  })
})

describe('parseCpuTime', () => {
  it.each([
    ['0:00.01', 0.01],
    ['12:34.56', 754.56],
    ['1:02:03.45', 3723.45],
    ['2-03:04:05', 183_845],
    [' 0:07.50 ', 7.5]
  ])('reads %s', (text, seconds) => {
    expect(parseCpuTime(text)).toBeCloseTo(seconds, 5)
  })

  it('refuses text that is not a CPU time', () => {
    expect(parseCpuTime('')).toBeNull()
    expect(parseCpuTime('abc')).toBeNull()
    expect(parseCpuTime('12')).toBeNull()
  })
})

describe('createCpuSampler', () => {
  it('reports the CPU used by the process tree since the previous sample', async () => {
    const clock = createVirtualClock()
    const asked: number[][] = []
    const times = ['100 0:10.00\n101 0:05.00\n', '100 0:12.00\n101 0:06.00\n']
    const sampler = createCpuSampler(clock, {
      listProcesses: async () => [
        { pid: 100, ppid: 1, command: 'electron' },
        { pid: 101, ppid: 100, command: 'helper' },
        { pid: 200, ppid: 1, command: 'unrelated' }
      ],
      psCpu: async (pids) => {
        asked.push([...pids])
        return times.shift() ?? ''
      }
    })
    expect(await sampler.sample(100)).toBeNull()
    await clock.advance(10_000)
    expect(await sampler.sample(100)).toBeCloseTo(30, 5)
    expect(asked).toEqual([
      [100, 101],
      [100, 101]
    ])
  })

  it('answers null when ps cannot be run', async () => {
    const sampler = createCpuSampler(createVirtualClock(), {
      listProcesses: async () => [],
      psCpu: async () => {
        throw new Error('ps failed')
      }
    })
    expect(await sampler.sample(1)).toBeNull()
  })
})
