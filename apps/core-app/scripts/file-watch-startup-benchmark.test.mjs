import assert from 'node:assert/strict'
import { spawnSync, fork } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { fileURLToPath } from 'node:url'
import {
  assertOwnedFixture,
  parseArgs,
  parsePowerMetrics,
  planRuns,
  statistics,
  summarizeEnergy,
  summarizeRuns
} from './file-watch-startup-benchmark.mjs'

const scriptPath = fileURLToPath(new URL('./file-watch-startup-benchmark.mjs', import.meta.url))
const require = createRequire(import.meta.url)
const header = `${'Name'.padEnd(33)}${'ID'.padEnd(7)}${'CPU ms/s'.padEnd(12)}${'User%'.padEnd(9)}Energy Impact`
const row = (name, pid, energy) =>
  `${name.padEnd(33)}${String(pid).padEnd(7)}${'2.30'.padEnd(12)}${'50.00'.padEnd(9)}${energy}`
const frame = (
  rows,
  { elapsed = '1000.31', powers = true, tableHeader = header } = {}
) => `*** Sampled system activity (Mon Sep 28 12:00:00 2026 +0800) (${elapsed}ms elapsed) ***
*** Running tasks ***
${tableHeader}
${rows.join('\n')}

${powers ? 'CPU Power: 1234 mW\nGPU Power: 25 mW\nANE Power: 0 mW\nCombined Power (CPU + GPU + ANE): 1259 mW' : ''}
`

test('strict CLI defaults and upper/lower bounds avoid arbitrary roots, profiles, output and worker access', () => {
  assert.deepEqual(parseArgs([]), {
    counts: [20000],
    repeats: 3,
    windowSeconds: 10,
    eventTimeoutSeconds: 3,
    energy: false,
    help: false
  })
  assert.deepEqual(
    parseArgs([
      '--',
      '--counts',
      '2000,20000',
      '--window-seconds',
      '60',
      '--repeats',
      '4',
      '--energy'
    ]).counts,
    [2000, 20000]
  )
  for (const argv of [
    ['--window-seconds', '9'],
    ['--window-seconds', '61'],
    ['--window-seconds', '10.5'],
    ['--repeats', '2'],
    ['--repeats', '11'],
    ['--counts', '0'],
    ['--counts', '200001'],
    ['--counts', '1,1'],
    ['--counts', '200000,199999,199998'],
    ['--counts', '1,2,3,4,5,6'],
    ['--counts', '../'],
    ['--counts'],
    ['--event-timeout-seconds', '0'],
    ['--energy', '--energy'],
    ['--root', os.homedir()],
    ['--output', '/tmp'],
    ['--profile', os.homedir()],
    ['--worker']
  ])
    assert.throws(() => parseArgs(argv), undefined, JSON.stringify(argv))
})

test('run plan retains all repeats, counts and alternates matched backend order', () => {
  const runs = planRuns(parseArgs(['--counts', '2,20']))
  assert.equal(runs.length, 12)
  assert.equal(new Set(runs.map((run) => run.id)).size, 12)
  assert.deepEqual(
    runs.slice(0, 6).map((run) => run.backend),
    [
      'chokidar-fsevents',
      'MacOSFileWatcher',
      'MacOSFileWatcher',
      'chokidar-fsevents',
      'chokidar-fsevents',
      'MacOSFileWatcher'
    ]
  )
  assert.ok(runs.every((run) => run.status === 'not-started'))
})

test('energy parser uses the exact child PID, not names, CPU values or substring PIDs', () => {
  const input = `Machine model: PRIVATE MACHINE\n${frame([
    row('Other Process With Spaces', 1412, '99.50'),
    row('node', 412, '0.20'),
    row('node', 4120, '31.00'),
    row('private process 412', 500, '5.00')
  ])}`
  const samples = parsePowerMetrics(input, 412)
  assert.equal(samples.length, 1)
  assert.equal(samples[0].childEnergyImpact, 0.2)
  assert.equal(samples[0].elapsedMs, 1000.31)
  assert.deepEqual(samples[0].wholeSocMilliwatts, { cpu: 1234, gpu: 25, ane: 0 })
  assert.doesNotMatch(JSON.stringify(samples), /PRIVATE|Other Process|node|private process/)
  assert.throws(() => parsePowerMetrics(input, 0))
  assert.throws(() => parsePowerMetrics(input, '412'))
})

test('zero is observed, missing PID rows and malformed rows remain unknown and all frames survive', () => {
  const input = [
    frame([row('node', 412, '0.00')]),
    frame([row('another', 88, '9.00')]),
    frame([row('node', 412, 'N/A')]),
    frame([row('node', 412, '9.00')], {
      tableHeader: header.replace('Energy Impact', 'Other score')
    }),
    frame([`${'node'.padEnd(33)}${'412'.padEnd(7)}3.0`]),
    frame([row('node', 412, '0.10'), row('node', 412, '0.20')])
  ].join('\n')
  const samples = parsePowerMetrics(input, 412)
  assert.equal(samples.length, 6)
  assert.deepEqual(
    samples.map((sample) => sample.childEnergyImpact),
    [0, null, null, null, null, null]
  )
  const summary = summarizeEnergy(samples, { code: 0, expectedSamples: 6 })
  assert.equal(summary.status, 'missing-target-samples')
  assert.equal(summary.childEnergyImpact.observed, 1)
  assert.equal(summary.childEnergyImpact.missing, 5)
  assert.equal(summary.completeWindowMeanEnergyImpact, null)
  assert.equal(summary.samples.length, 6)
})

test('energy summary discloses sampler exit failures, truncated output, no samples, and actual stderr categories', () => {
  const samples = parsePowerMetrics(frame([row('node', 412, '0.00')], { powers: false }), 412)
  const stderr =
    'powermetrics: proc_pidpath failed for /Users/private/person\nsudo: forbidden secret details\n'
  const failed = summarizeEnergy(samples, { code: 1, stderr, expectedSamples: 1 })
  assert.equal(failed.status, 'sampler-failed')
  assert.deepEqual(failed.stderr, {
    present: true,
    lineCount: 2,
    procPidpathRaceWarnings: 1,
    otherLinesSuppressed: 1
  })
  assert.doesNotMatch(JSON.stringify(failed), /Users|private|secret|person/)
  assert.equal(failed.wholeSocMilliwatts.cpu.missing, 1)
  assert.equal(summarizeEnergy([], { code: 0 }).status, 'missing-target-samples')
  assert.equal(
    summarizeEnergy(samples, { code: 0, expectedSamples: 3 }).status,
    'incomplete-sampling-window'
  )
  assert.equal(summarizeEnergy(samples, { code: 0, truncated: true }).status, 'sampler-failed')
  assert.equal(summarizeEnergy(samples, { code: 0, error: 'timeout' }).status, 'sampler-failed')
  assert.equal(summarizeEnergy(samples, { code: 0, signal: 'SIGTERM' }).status, 'sampler-failed')
  const warningOnly = summarizeEnergy(samples, {
    code: 0,
    stderr: 'proc_pidpath race\n',
    expectedSamples: 1
  })
  assert.equal(warningOnly.status, 'complete')
  assert.equal(warningOnly.completeWindowMeanEnergyImpact, 0)
})

test('statistics and comparisons do not discard failed windows or claim budgets from partial pairs', () => {
  assert.deepEqual(statistics([0, 4, 2, null, undefined, Number.NaN]), {
    total: 6,
    observed: 3,
    missing: 3,
    min: 0,
    median: 2,
    meanObserved: 2,
    max: 4
  })
  const runs = planRuns(parseArgs([]))
  for (const run of runs) {
    const baseline = run.backend === 'chokidar-fsevents'
    run.status = 'complete'
    run.measurement = {
      registration: {
        cpu: { totalMs: baseline ? 100 : 5 },
        fsOperations: { total: baseline ? 20000 : 1 }
      },
      window: { cpu: { totalMs: baseline ? 150 : 10 } },
      events: ['add', 'change', 'unlink'].map((event) => ({ event, latencyMs: 600 }))
    }
  }
  assert.equal(summarizeRuns(runs)[0].moduleRegistrationBudgetMet, true)
  runs[3].status = 'failed'
  runs[3].measurement = null
  const incomplete = summarizeRuns(runs)[0]
  assert.equal(incomplete.complete, false)
  assert.equal(incomplete.medianRegistrationCpuRatio, null)
  assert.equal(incomplete.moduleRegistrationBudgetMet, null)
  assert.equal(incomplete.groups['chokidar-fsevents'].registrationCpuMs.missing, 1)
  assert.equal(incomplete.groups['chokidar-fsevents'].planned, 3)
})

test('cleanup ownership refuses unrelated paths, weak permissions, and symlink replacement', () => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-watch-benchmark-')))
  fs.chmodSync(directory, 0o700)
  const fixture = path.join(directory, 'fixtures')
  fs.mkdirSync(fixture, { mode: 0o700 })
  try {
    assert.equal(assertOwnedFixture(directory, fixture), fixture)
    assert.throws(() => assertOwnedFixture(directory, os.homedir()))
    fs.chmodSync(directory, 0o755)
    assert.throws(() => assertOwnedFixture(directory, fixture))
    fs.chmodSync(directory, 0o700)
    fs.rmdirSync(fixture)
    fs.symlinkSync(os.homedir(), fixture)
    assert.throws(() => assertOwnedFixture(directory, fixture))
    fs.unlinkSync(fixture)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('CLI help and rejection are bounded and need no tsx, sudo, production imports or filesystem fixtures', () => {
  const before = new Set(
    fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('tuff-watch-benchmark-'))
  )
  const help = spawnSync(process.execPath, [scriptPath, '--help'], {
    encoding: 'utf8',
    timeout: 3000
  })
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /Energy Impact is not watts/)
  const rejected = spawnSync(process.execPath, [scriptPath, '--worker'], {
    encoding: 'utf8',
    timeout: 3000
  })
  assert.equal(rejected.status, 2)
  assert.doesNotMatch(rejected.stderr, /stack|\/Users\//)
  const after = new Set(
    fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('tuff-watch-benchmark-'))
  )
  assert.deepEqual(after, before)
})

test(
  'opt-in real backend smoke: isolated children observe create/change/delete and await watcher close',
  {
    skip: process.env.TUFF_WATCH_BENCHMARK_SMOKE !== '1' || process.platform !== 'darwin',
    timeout: 45000
  },
  async () => {
    const directory = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-watch-benchmark-'))
    )
    fs.chmodSync(directory, 0o700)
    const fixture = path.join(directory, 'fixtures', 'files-12')
    fs.mkdirSync(fixture, { recursive: true, mode: 0o700 })
    for (let fileIndex = 0; fileIndex < 12; fileIndex += 1)
      fs.writeFileSync(path.join(fixture, `file-${fileIndex}.txt`), 'synthetic\n')
    try {
      for (const backend of ['chokidar-fsevents', 'MacOSFileWatcher']) {
        const child = fork(scriptPath, ['--worker'], {
          execArgv: ['--import', require.resolve('tsx')],
          silent: true,
          env: { ...process.env, NODE_OPTIONS: '' }
        })
        let errorOutput = ''
        child.stderr.on('data', (chunk) => {
          errorOutput = `${errorOutput}${chunk}`.slice(-4096)
        })
        child.stdout.resume()
        let result
        let watcherClosed = false
        const finished = new Promise((resolve, reject) => {
          child.on('error', reject)
          child.on('message', (message) => {
            if (message.type === 'prepared') child.send({ type: 'start' })
            if (message.type === 'measurement') {
              result = message.measurement
              child.send({ type: 'release' })
            }
            if (message.type === 'watcher-closed') watcherClosed = true
          })
          child.on('close', (code) => resolve(code))
        })
        const timer = setTimeout(() => child.kill('SIGKILL'), 18000)
        try {
          child.send({
            type: 'configure',
            config: {
              role: 'watcher',
              artifactRoot: directory,
              backend,
              fileCount: 12,
              windowSeconds: 10,
              eventTimeoutSeconds: 3
            }
          })
          const code = await finished
          assert.equal(code, 0, `${backend}: ${errorOutput}`)
          assert.equal(watcherClosed, true, backend)
          assert.equal(result.status, 'complete', `${backend}: ${JSON.stringify(result.errors)}`)
          assert.deepEqual(
            result.events.map((event) => event.status),
            ['delivered', 'delivered', 'delivered']
          )
          assert.ok(result.window.wallMs >= 9900 && result.window.wallMs < 13000)
          assert.ok(result.registration.cpu.totalMs >= 0)
          assert.ok(result.window.memoryAfter.rssBytes > 0)
          assert.ok(result.window.eventLoopDelay.samples > 0)
          if (backend === 'chokidar-fsevents')
            assert.ok(result.registration.fsOperations.total > 12)
          else assert.ok(result.registration.fsOperations.total <= 64)
        } finally {
          clearTimeout(timer)
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
          await finished
        }
      }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
)
