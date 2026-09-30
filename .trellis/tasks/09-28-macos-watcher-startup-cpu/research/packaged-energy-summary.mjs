import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

function median(values) {
  const sorted = values.toSorted((a, b) => a - b)
  return (sorted[Math.floor(sorted.length / 2)] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2
}

export function summarizeWindow(run, name) {
  const phase = run.phases.find(entry => entry.name === name)
  assert.ok(phase, `Missing window: ${name}`)
  const samples = run.samples.filter(
    sample =>
      sample.rootObserved
      && !sample.invalid
      && sample.sampleEndAt - sample.durationMs >= phase.startAt + 1000
      && sample.sampleEndAt <= phase.endAt - 1000,
  )
  for (const sample of samples) {
    for (const key of ['durationMs', 'cpuMs', 'energyImpact']) {
      assert.ok(Number.isFinite(sample[key]) && sample[key] >= 0, `Invalid ${key}: ${name}`)
    }
    assert.ok(sample.durationMs > 0)
  }
  const sum = key => samples.reduce((total, sample) => total + sample[key], 0)
  const wallMs = phase.endAt - phase.startAt
  const sampledMs = sum('durationMs')
  assert.ok(wallMs >= 30000, 'Only sustained windows support the energy comparison')
  assert.ok(samples.length > 0 && sampledMs >= wallMs - 7000, `Incomplete window: ${name}`)
  return {
    wallMs,
    sampledMs,
    sampleCount: samples.length,
    sampledFraction: sampledMs / wallMs,
    energyImpactRate: sum('energyImpact') / (sampledMs / 1000),
    groupCpuPercent: (100 * sum('cpuMs')) / sampledMs,
    groupCpuMs: sum('cpuMs'),
    bytesRead: sum('bytesRead'),
    bytesWritten: sum('bytesWritten'),
    interruptWakeups: sum('interruptWakeups'),
    thermalPressure: [...new Set(samples.map(sample => sample.thermalPressure))],
  }
}

export function summarizeRun(run) {
  assert.equal(run.status, 'complete', `Run failed: ${run.name}`)
  assert.equal(run.mode, 'warm')
  assert.ok(['baseline', 'candidate'].includes(run.variant))
  assert.equal(run.samplerExit.code, 0)
  assert.equal(run.energyFailure, undefined)
  assert.equal(run.finalFiles, 3000)
  assert.equal(run.finalFts, 3000)
  assert.equal(run.paddingRows, 1197000)
  assert.equal(run.search.n, 42)
  assert.equal(run.searchDuringUpdates.n, 20)
  const ready = status =>
    status.status.startupReady
    && !status.status.startupPending
    && !status.status.isInitializing
    && !status.status.initializationFailed
    && !status.busy
  assert.ok(ready(run.afterIndex) && ready(run.finalStatus), 'Indexing did not converge')
  assert.ok(run.idleAfter.windows.every(window => !window.visible))
  return {
    name: run.name,
    variant: run.variant,
    repeat: run.repeat,
    node: run.node,
    startedAt: run.startedAt,
    indexReadyMs: run.indexCompleteMs,
    watchUpdateDrainedMs: run.watchUpdateMs,
    watchInsertVisibleMs: run.watchInsertVisibleMs,
    watchDeleteVisibleMs: run.watchDeleteVisibleMs,
    searchP95Ms: run.search.p95,
    concurrentSearchP95Ms: run.searchDuringUpdates.p95,
    finalFiles: run.finalFiles,
    finalFts: run.finalFts,
    paddingRows: run.paddingRows,
    eventLoopWarningOccurrences: run.loopWarnings,
    windows: Object.fromEntries(
      ['idle-before', 'watch-updates', 'idle-after'].map(name => [name, summarizeWindow(run, name)]),
    ),
  }
}

export function aggregate(runs) {
  const result = {}
  for (const variant of ['baseline', 'candidate']) {
    const group = runs.filter(run => run.variant === variant)
    assert.equal(group.length, 3)
    const repeats = group.map(run => run.repeat).toSorted()
    assert.deepEqual(repeats, [5, 6, 7])
    result[variant] = {
      indexReadyMs: median(group.map(run => run.indexReadyMs)),
      watchUpdateDrainedMs: median(group.map(run => run.watchUpdateDrainedMs)),
      watchInsertVisibleMs: median(group.map(run => run.watchInsertVisibleMs)),
      watchDeleteVisibleMs: median(group.map(run => run.watchDeleteVisibleMs)),
      searchP95Ms: median(group.map(run => run.searchP95Ms)),
      concurrentSearchP95Ms: median(group.map(run => run.concurrentSearchP95Ms)),
      windows: Object.fromEntries(
        ['idle-before', 'watch-updates', 'idle-after'].map(name => [
          name,
          {
            energyImpactRate: median(group.map(run => run.windows[name].energyImpactRate)),
            groupCpuPercent: median(group.map(run => run.windows[name].groupCpuPercent)),
          },
        ]),
      ),
    }
  }
  return result
}

async function main() {
  assert.ok(process.argv[2], 'Usage: node packaged-energy-summary.mjs RAW_RUN_DIRECTORY')
  const runs = []
  for (const repeat of [5, 6, 7]) {
    for (const variant of ['baseline', 'candidate']) {
      const file = resolve(process.argv[2], `warm-${repeat}-${variant}`, 'result.json')
      runs.push(summarizeRun(JSON.parse(await readFile(file, 'utf8'))))
    }
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        method:
          'Duration-weighted native process-group Energy Impact rate and CPU, then median of three runs per variant. Not watts, joules, battery life, or foreground UI latency.',
        baselineSource: '226e8d2fb960c053b3d0dbd6204b1221c1ead217',
        candidateSource: '29044f48bc1286aa55bdd24243d38860f2cf9d9a',
        order: ['baseline/candidate', 'candidate/baseline', 'baseline/candidate'],
        fixture:
          '3000 production-indexed files plus 1197000 FTS/meta padding rows belonging to a separate synthetic provider; 200 metadata changes, 20 creates, 20 deletes.',
        aggregate: aggregate(runs),
        runs,
      },
      null,
      2,
    )}\n`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
