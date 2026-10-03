import assert from 'node:assert/strict'
import { it } from 'vitest'
import { summarizeWindow } from './packaged-energy-summary.mjs'

function fixture() {
  return {
    phases: [{ name: 'idle', startAt: 0, endAt: 60000 }],
    samples: Array.from({ length: 57 }, (_, i) => ({
      rootObserved: true,
      invalid: false,
      sampleEndAt: 2000 + i * 1000,
      durationMs: 1000,
      cpuMs: 5,
      energyImpact: 2,
      bytesRead: 0,
      bytesWritten: 0,
      interruptWakeups: 1,
      thermalPressure: 'Nominal',
    })),
  }
}

it('computes rates using observed durations rather than averaging sample rates', () => {
  const run = fixture()
  run.samples[0].durationMs = 500
  run.samples[0].energyImpact = 10
  const result = summarizeWindow(run, 'idle')
  assert.equal(result.energyImpactRate, 122 / 56.5)
  assert.equal(result.groupCpuPercent, (100 * 285) / 56500)
})

it('rejects incomplete sampling instead of treating missing energy as zero', () => {
  const run = fixture()
  run.samples = run.samples.slice(0, 10)
  assert.throws(() => summarizeWindow(run, 'idle'), /Incomplete window/)
})

it('excludes invalid samples and samples without the owned root', () => {
  const run = fixture()
  run.samples[0].invalid = true
  run.samples[0].energyImpact = 100000
  run.samples[1].rootObserved = false
  run.samples[1].energyImpact = 100000
  assert.equal(summarizeWindow(run, 'idle').energyImpactRate, 2)
})

it('rejects non-finite energy and phases too short for sustained comparison', () => {
  const run = fixture()
  run.samples[0].energyImpact = Number.NaN
  assert.throws(() => summarizeWindow(run, 'idle'), /Invalid energyImpact/)
  const short = fixture()
  short.phases[0].endAt = 4000
  assert.throws(() => summarizeWindow(short, 'idle'), /Only sustained windows/)
})
