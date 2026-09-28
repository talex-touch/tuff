#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const appRoot = path.resolve(path.dirname(scriptPath), '..')
const load = createRequire(path.join(appRoot, 'package.json'))
const candidatePath = path.join(
  appRoot,
  'src/main/modules/box-tool/file-system-watcher/macos-file-watcher.ts'
)
const backends = ['chokidar-fsevents', 'MacOSFileWatcher']
const maxOutputBytes = 64 * 1024 * 1024
const scope =
  'Watcher-module registration and file events only; no Electron startup, database, indexing, subtree reconciliation, or application idle/energy verdict. invalidate is not completed indexing.'

export const usage = `Usage: pnpm -C apps/core-app exec tsx scripts/file-watch-startup-benchmark.mjs [options]
  --counts 20000             Comma-separated admitted file counts (1..200000; total <=500000)
  --repeats 3                Alternating paired repeats (3..10)
  --window-seconds 10        Fixed registration + event observation window (10..60)
  --event-timeout-seconds 3  Per-event deadline within that window (1..10)
  --energy                   Optional sudo -n /usr/bin/powermetrics tasks,cpu_power at 1000ms
  --help                     No filesystem writes, children, or sudo

Every backend runs in a fresh Node child with --import tsx. Run alone, not alongside builds/tests.
Only generated, canonicalized private temporary fixtures are watched/deleted. No --root or profile option.
Private raw artifacts (including unrelated powermetrics rows/stderr) remain in a new 0700 temp directory.
summary.redacted.json is the only shareable artifact; every attempted window is retained.
Energy Impact is not watts. CPU/GPU/ANE mW are whole-SoC estimates, never attributed to the child.
Energy sampling includes a one-sample lead-in and a tail; all samples, including missing PIDs, are reported.
Exit 0: complete module measurements; 1: failed/incomplete measurements; 2: invalid CLI/preflight.
${scope}
`

function integer(value, minimum, maximum, flag) {
  if (!/^\d+$/.test(value ?? '')) throw new Error(`Invalid integer for ${flag}`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${flag} must be in ${minimum}..${maximum}`)
  }
  return parsed
}

export function parseArgs(argv) {
  const options = {
    counts: [20000],
    repeats: 3,
    windowSeconds: 10,
    eventTimeoutSeconds: 3,
    energy: false,
    help: false
  }
  const seen = new Set()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--' && index === 0) continue
    if (seen.has(flag)) throw new Error('Duplicate option')
    seen.add(flag)
    if (flag === '--help') options.help = true
    else if (flag === '--energy') options.energy = true
    else if (flag === '--counts') {
      options.counts = (argv[++index] ?? '')
        .split(',')
        .map((value) => integer(value, 1, 200000, flag))
      if (
        options.counts.length > 5 ||
        new Set(options.counts).size !== options.counts.length ||
        options.counts.reduce((total, count) => total + count, 0) > 500000
      ) {
        throw new Error('Counts must be unique, at most five, and total at most 500000')
      }
    } else if (flag === '--repeats') options.repeats = integer(argv[++index], 3, 10, flag)
    else if (flag === '--window-seconds')
      options.windowSeconds = integer(argv[++index], 10, 60, flag)
    else if (flag === '--event-timeout-seconds')
      options.eventTimeoutSeconds = integer(argv[++index], 1, 10, flag)
    else throw new Error('Unknown option; use --help')
  }
  return options
}

export function planRuns(options) {
  return options.counts.flatMap((fileCount) =>
    Array.from({ length: options.repeats }, (_, repeatIndex) => {
      const order = repeatIndex % 2 === 0 ? backends : [...backends].reverse()
      return order.map((backend, orderIndex) => ({
        id: `files-${fileCount}-repeat-${repeatIndex + 1}-${backend}`,
        fileCount,
        repeat: repeatIndex + 1,
        order: orderIndex + 1,
        backend,
        status: 'not-started'
      }))
    }).flat()
  )
}

export function statistics(values) {
  const observed = values
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
    .sort((left, right) => left - right)
  const middle = Math.floor(observed.length / 2)
  return {
    total: values.length,
    observed: observed.length,
    missing: values.length - observed.length,
    min: observed.length ? observed[0] : null,
    median: observed.length
      ? (observed[middle] + observed[Math.floor((observed.length - 1) / 2)]) / 2
      : null,
    meanObserved: observed.length
      ? observed.reduce((total, value) => total + value, 0) / observed.length
      : null,
    max: observed.length ? observed.at(-1) : null
  }
}

function finiteNumber(value) {
  return /^\d+(?:\.\d+)?$/.test(value?.trim() ?? '') ? Number(value) : null
}

export function parsePowerMetrics(text, targetPid) {
  assert.ok(Number.isSafeInteger(targetPid) && targetPid > 0, 'A positive child PID is required')
  const blocks = text
    .split(/(?=^\*{3} Sampled system activity)/m)
    .filter((block) => /^\*{3} Sampled system activity/m.test(block))
  return blocks.map((block, index) => {
    const lines = block.split(/\r?\n/)
    const marker = lines[0]
    const timestamp = marker.match(/activity \((.*?)\) \(([\d.]+)ms elapsed\)/)
    const headerIndex = lines.findIndex(
      (line) => /^Name\s+(?:ID|PID)\s+/.test(line.trim()) && /Energy Impact\s*$/.test(line)
    )
    let childEnergyImpact = null
    let matchedRows = 0
    if (headerIndex >= 0) {
      const header = lines[headerIndex]
      const pidStart = header.search(/\b(?:ID|PID)\b/)
      const cpuStart = header.indexOf('CPU', pidStart)
      const energyStart = header.indexOf('Energy Impact')
      const columns = header.trim().split(/\s{2,}|\t+/)
      for (const line of lines.slice(headerIndex + 1)) {
        if (/^\*{3}/.test(line)) break
        const fields = line.trim().split(/\s{2,}|\t+/)
        const columnPid = cpuStart > pidStart ? line.slice(pidStart, cpuStart).trim() : ''
        const splitPid = fields.length === columns.length ? fields[1] : ''
        if (columnPid !== String(targetPid) && splitPid !== String(targetPid)) continue
        const energyTail = line.slice(energyStart)
        const value =
          finiteNumber(energyTail) ?? finiteNumber(energyTail.slice('Energy Impact'.length))
        matchedRows += 1
        childEnergyImpact = value
      }
    }
    if (matchedRows !== 1) childEnergyImpact = null
    const power = (component) =>
      finiteNumber(
        block.match(new RegExp(`^${component} Power:\\s*([\\d.]+)\\s*mW\\s*$`, 'm'))?.[1]
      )
    return {
      index: index + 1,
      elapsedMs: finiteNumber(timestamp?.[2]),
      sampledAt: timestamp?.[1] ?? null,
      childEnergyImpact,
      targetStatus:
        childEnergyImpact === null
          ? headerIndex < 0
            ? 'missing-energy-header'
            : 'missing-or-invalid-target'
          : 'observed',
      wholeSocMilliwatts: { cpu: power('CPU'), gpu: power('GPU'), ane: power('ANE') }
    }
  })
}

export function summarizeEnergy(
  samples,
  {
    code = null,
    signal = null,
    error = null,
    stderr = '',
    truncated = false,
    expectedSamples = null
  } = {}
) {
  const energyImpact = statistics(samples.map((sample) => sample.childEnergyImpact))
  const stderrLines = stderr.split(/\r?\n/).filter((line) => line.trim())
  const raceWarnings = stderrLines.filter((line) => /proc_pidpath/i.test(line)).length
  return {
    status:
      code !== 0 || signal || error || truncated
        ? 'sampler-failed'
        : !samples.length || energyImpact.missing
          ? 'missing-target-samples'
          : expectedSamples !== null && samples.length !== expectedSamples
            ? 'incomplete-sampling-window'
            : 'complete',
    exitCode: code,
    signal,
    launchOrTimeoutFailure: Boolean(error),
    truncated,
    expectedSamples,
    recordedSamples: samples.length,
    childEnergyImpact: energyImpact,
    completeWindowMeanEnergyImpact:
      samples.length && !energyImpact.missing ? energyImpact.meanObserved : null,
    wholeSocMilliwatts: Object.fromEntries(
      ['cpu', 'gpu', 'ane'].map((component) => [
        component,
        statistics(samples.map((sample) => sample.wholeSocMilliwatts[component]))
      ])
    ),
    stderr: {
      present: stderrLines.length > 0,
      lineCount: stderrLines.length,
      procPidpathRaceWarnings: raceWarnings,
      otherLinesSuppressed: stderrLines.length - raceWarnings
    },
    samples,
    interpretation:
      'Energy Impact is a process score, not W/mW or joules. Whole-SoC power includes all host activity and is not child/app power. Missing target rows are unknown, never zero.'
  }
}

export function summarizeRuns(runs) {
  return [...new Set(runs.map((run) => run.fileCount))].map((fileCount) => {
    const groups = Object.fromEntries(
      backends.map((backend) => {
        const selected = runs.filter(
          (run) => run.fileCount === fileCount && run.backend === backend
        )
        return [
          backend,
          {
            planned: selected.length,
            completed: selected.filter((run) => run.status === 'complete').length,
            registrationCpuMs: statistics(
              selected.map((run) => run.measurement?.registration?.cpu.totalMs)
            ),
            registrationFsOperations: statistics(
              selected.map((run) => run.measurement?.registration?.fsOperations.total)
            ),
            windowCpuMs: statistics(selected.map((run) => run.measurement?.window?.cpu.totalMs)),
            eventLatencyMs: Object.fromEntries(
              ['add', 'change', 'unlink'].map((event) => [
                event,
                statistics(
                  selected.map(
                    (run) =>
                      run.measurement?.events?.find((item) => item.event === event)?.latencyMs
                  )
                )
              ])
            )
          }
        ]
      })
    )
    const baseline = groups[backends[0]]
    const candidate = groups[backends[1]]
    const complete = backends.every(
      (backend) => groups[backend].completed === groups[backend].planned
    )
    const ratio =
      complete && baseline.registrationCpuMs.median > 0
        ? candidate.registrationCpuMs.median / baseline.registrationCpuMs.median
        : null
    return {
      fileCount,
      groups,
      complete,
      medianRegistrationCpuRatio: ratio,
      moduleRegistrationBudgetMet:
        ratio === null ? null : ratio <= 0.1 && candidate.registrationFsOperations.max <= 64
    }
  })
}

async function bounded(promise, timeoutMs, label) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), Math.max(1, timeoutMs))
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

function privateJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

export function assertOwnedFixture(artifactRoot, fixtureRoot) {
  const canonicalArtifacts = fs.realpathSync(artifactRoot)
  const canonicalTemp = fs.realpathSync(os.tmpdir())
  assert.equal(path.dirname(canonicalArtifacts), canonicalTemp)
  assert.match(path.basename(canonicalArtifacts), /^tuff-watch-benchmark-[a-zA-Z0-9]+$/)
  const metadata = fs.lstatSync(canonicalArtifacts)
  assert.ok(metadata.isDirectory() && (metadata.mode & 0o077) === 0)
  assert.equal(metadata.uid, process.getuid?.())
  const expected = path.join(canonicalArtifacts, 'fixtures')
  assert.equal(fixtureRoot, expected)
  assert.ok(!fs.lstatSync(fixtureRoot).isSymbolicLink())
  assert.equal(fs.realpathSync(fixtureRoot), expected)
  return expected
}

function instrumentFileSystem() {
  const counts = {}
  let enabled = false
  for (const [prefix, target, names] of [
    ['fs', fs, ['stat', 'lstat', 'readdir', 'statSync', 'lstatSync', 'readdirSync']],
    ['promises', fs.promises, ['stat', 'lstat', 'readdir']]
  ]) {
    for (const name of names) {
      const key = `${prefix}.${name}`
      counts[key] = 0
      const original = target[name]
      target[name] = function (...args) {
        if (enabled) counts[key] += 1
        return original.apply(this, args)
      }
    }
  }
  syncBuiltinESMExports()
  return {
    start() {
      enabled = true
    },
    snapshot() {
      return {
        total: Object.values(counts).reduce((total, count) => total + count, 0),
        calls: { ...counts }
      }
    }
  }
}

function memory() {
  const usage = process.memoryUsage()
  return { heapUsedBytes: usage.heapUsed, heapTotalBytes: usage.heapTotal, rssBytes: usage.rss }
}

function loopSnapshot(histogram) {
  return {
    resolutionMs: 10,
    samples: Number(histogram.count),
    maxMs: histogram.count ? histogram.max / 1e6 : null,
    meanMs: histogram.count ? histogram.mean / 1e6 : null,
    p99Ms: histogram.count ? histogram.percentile(99) / 1e6 : null
  }
}

function measureSince(started, cpuBefore, memoryBefore, instrumentation, histogram) {
  const cpu = process.cpuUsage(cpuBefore)
  const wallMs = performance.now() - started
  return {
    wallMs,
    cpu: {
      userMs: cpu.user / 1000,
      systemMs: cpu.system / 1000,
      totalMs: (cpu.user + cpu.system) / 1000,
      percentOneCore: (cpu.user + cpu.system) / (wallMs * 10)
    },
    fsOperations: instrumentation.snapshot(),
    memoryBefore,
    memoryAfter: memory(),
    eventLoopDelay: loopSnapshot(histogram)
  }
}

function send(message) {
  if (process.connected) process.send(message)
}

function receive(type) {
  return new Promise((resolve) => {
    const listener = (message) => {
      if (message?.type !== type) return
      process.off('message', listener)
      resolve(message)
    }
    process.on('message', listener)
  })
}

async function watcherWorker(config) {
  assertOwnedFixture(config.artifactRoot, path.join(config.artifactRoot, 'fixtures'))
  const root = fs.realpathSync(
    path.join(config.artifactRoot, 'fixtures', `files-${config.fileCount}`)
  )
  assert.equal(root, path.join(config.artifactRoot, 'fixtures', `files-${config.fileCount}`))
  const instrumentation = instrumentFileSystem()
  const ignored = (watchPath) =>
    path.basename(watchPath).startsWith('.') || watchPath.split(path.sep).includes('node_modules')
  let createWatcher
  if (config.backend === backends[0]) {
    assert.equal(
      load('chokidar-fsevents/package.json').version,
      '3.6.0',
      'Baseline must be pinned chokidar-fsevents 3.6.0'
    )
    const chokidar = load('chokidar-fsevents')
    createWatcher = () =>
      chokidar.watch([], {
        persistent: true,
        ignoreInitial: true,
        depth: 24,
        ignored,
        useFsEvents: true,
        usePolling: false,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
      })
  } else {
    assert.equal(config.backend, backends[1])
    const { MacOSFileWatcher } = await import(pathToFileURL(candidatePath).href)
    createWatcher = () =>
      new MacOSFileWatcher({ depth: 24, ignored, stabilityThresholdMs: 500, pollIntervalMs: 100 })
  }
  const startRequest = receive('start')
  send({ type: 'prepared', pid: process.pid })
  await bounded(startRequest, 10000, 'Start handshake')
  const histogram = monitorEventLoopDelay({ resolution: 10 })
  histogram.enable()
  await delay(20)
  histogram.reset()
  const memoryBefore = memory()
  let peakMemory = { ...memoryBefore }
  const memoryTimer = setInterval(() => {
    const current = memory()
    for (const key of Object.keys(peakMemory))
      peakMemory[key] = Math.max(peakMemory[key], current[key])
  }, 50)
  const started = performance.now()
  const cpuBefore = process.cpuUsage()
  const startedAt = new Date().toISOString()
  const deadline = started + config.windowSeconds * 1000
  const errors = []
  let errorCount = 0
  const recordError = (error) => {
    errorCount += 1
    if (errors.length < 32) errors.push(String(error?.stack ?? error).slice(0, 4096))
  }
  const events = []
  const delivered = []
  let invalidations = 0
  let deliveredCount = 0
  let expected = null
  let watcher
  let registration = null
  let windowMeasurement
  instrumentation.start()
  try {
    watcher = createWatcher()
    watcher.on('error', recordError)
    watcher.on('invalidate', () => {
      invalidations += 1
    })
    for (const event of ['add', 'change', 'unlink']) {
      watcher.on(event, (changedPath) => {
        deliveredCount += 1
        if (delivered.length < 256)
          delivered.push({ event, path: changedPath, offsetMs: performance.now() - started })
        if (expected?.event === event && changedPath === expected.path)
          expected.resolve(performance.now())
      })
    }
    if (config.backend === backends[0]) {
      assert.equal(watcher.options.useFsEvents, true, 'Baseline fell back from FSEvents')
      assert.equal(watcher.options.usePolling, false, 'Baseline unexpectedly uses polling')
      const ready = new Promise((resolve, reject) => {
        watcher.once('ready', resolve)
        watcher.once('error', reject)
      })
      watcher.add(root)
      await bounded(ready, deadline - performance.now(), 'Registration')
    } else {
      await bounded(watcher.add(root), deadline - performance.now(), 'Registration')
    }
    registration = measureSince(started, cpuBefore, memoryBefore, instrumentation, histogram)
    send({ type: 'registration', registration })
    await delay(Math.max(0, Math.min(1000, deadline - performance.now())))
    const probePath = path.join(root, 'latency-probe.txt')
    for (const event of ['add', 'change', 'unlink']) {
      const remaining = deadline - performance.now()
      if (remaining <= 0) {
        events.push({ event, status: 'window-exhausted', latencyMs: null })
        continue
      }
      const mutationStarted = performance.now()
      let resolveEvent
      const observed = new Promise((resolve) => {
        resolveEvent = resolve
      })
      expected = { event, path: probePath, resolve: resolveEvent }
      try {
        if (event === 'add')
          fs.writeFileSync(probePath, 'synthetic create\n', { flag: 'wx', mode: 0o600 })
        else if (event === 'change') fs.appendFileSync(probePath, 'synthetic changed content\n')
        else fs.unlinkSync(probePath)
        const writeCompletedMs = performance.now() - mutationStarted
        const observedAt = await bounded(
          observed,
          Math.min(config.eventTimeoutSeconds * 1000, deadline - performance.now()),
          `${event} delivery`
        )
        events.push({
          event,
          status: 'delivered',
          latencyMs: observedAt - mutationStarted,
          writeCompletedMs,
          offsetMs: mutationStarted - started
        })
      } catch (error) {
        events.push({
          event,
          status: 'failed',
          latencyMs: null,
          error: String(error),
          offsetMs: mutationStarted - started
        })
      } finally {
        expected = null
      }
      await delay(Math.max(0, Math.min(150, deadline - performance.now())))
    }
  } catch (error) {
    recordError(error)
  } finally {
    await delay(Math.max(0, deadline - performance.now()))
    windowMeasurement = measureSince(started, cpuBefore, memoryBefore, instrumentation, histogram)
    histogram.disable()
    clearInterval(memoryTimer)
  }
  const release = receive('release')
  const measurement = {
    pid: process.pid,
    startedAt,
    endedAt: new Date().toISOString(),
    requestedWindowMs: config.windowSeconds * 1000,
    registration,
    window: windowMeasurement,
    peakMemorySampled: peakMemory,
    processLifetimeMaxRssKiB: process.resourceUsage().maxRSS,
    events,
    invalidations,
    deliveredCount,
    delivered,
    errors,
    errorCount,
    status:
      registration &&
      events.length === 3 &&
      events.every((event) => event.status === 'delivered') &&
      !errorCount
        ? 'complete'
        : 'failed'
  }
  send({ type: 'measurement', measurement })
  try {
    await bounded(release, 10000, 'Sampler release')
  } finally {
    await bounded(Promise.resolve(watcher?.close()), 5000, 'Watcher close')
    send({ type: 'watcher-closed' })
    process.disconnect()
  }
}

async function workerMain() {
  process.umask(0o077)
  process.on('disconnect', () => process.exit())
  const { config } = await bounded(receive('configure'), 10000, 'Configuration')
  if (config.role === 'watcher') return watcherWorker(config)
  const fixtureRoot = assertOwnedFixture(
    config.artifactRoot,
    path.join(config.artifactRoot, 'fixtures')
  )
  if (config.role === 'cleanup')
    fs.rmSync(fixtureRoot, { recursive: true, force: false, maxRetries: 0 })
  else if (config.role === 'fixture') {
    for (const count of config.counts) {
      const root = path.join(fixtureRoot, `files-${count}`)
      fs.mkdirSync(root)
      for (let fileIndex = 0; fileIndex < count; fileIndex += 1) {
        const directory = path.join(
          root,
          `group-${Math.floor(fileIndex / 1000)}`,
          `batch-${Math.floor(fileIndex / 100)}`
        )
        if (fileIndex % 100 === 0) fs.mkdirSync(directory, { recursive: true })
        fs.writeFileSync(path.join(directory, `file-${fileIndex}.txt`), 'synthetic fixture\n', {
          flag: 'wx',
          mode: 0o600
        })
      }
    }
  } else throw new Error('Unknown worker role')
  process.disconnect()
}

function launch(
  executable,
  args,
  directory,
  name,
  owned,
  { ipc = false, privileged = false } = {}
) {
  const stdoutPath = path.join(directory, `${name}.stdout.txt`)
  const stderrPath = path.join(directory, `${name}.stderr.txt`)
  const stdoutFd = fs.openSync(stdoutPath, 'wx', 0o600)
  const stderrFd = fs.openSync(stderrPath, 'wx', 0o600)
  const environment = { ...process.env, NODE_OPTIONS: '', LC_ALL: 'C', LANG: 'C' }
  delete environment.NODE_V8_COVERAGE
  const child = spawn(executable, args, {
    cwd: appRoot,
    env: environment,
    detached: privileged,
    stdio: ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe']
  })
  const control = {
    child,
    stdoutPath,
    stderrPath,
    privileged,
    closed: false,
    messages: [],
    truncated: false,
    error: null,
    startedAt: new Date().toISOString()
  }
  owned.add(control)
  let resolveFirstSample
  control.firstSample = new Promise((resolve) => {
    resolveFirstSample = resolve
  })
  let tail = ''
  for (const [stream, descriptor] of [
    [child.stdout, stdoutFd],
    [child.stderr, stderrFd]
  ]) {
    let bytes = 0
    stream.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes > maxOutputBytes) {
        control.truncated = true
        child.kill('SIGTERM')
        return
      }
      fs.writeSync(descriptor, chunk)
      if (stream === child.stdout) {
        const output = `${tail}${chunk.toString('utf8')}`
        if (/\*{3} Sampled system activity/.test(output)) resolveFirstSample()
        tail = output.slice(-256)
      }
    })
  }
  child.on('message', (message) => {
    if (control.messages.length < 32) control.messages.push(message)
  })
  control.done = new Promise((resolve) => {
    child.on('error', (error) => {
      control.error = String(error)
    })
    child.once('close', (code, signal) => {
      control.closed = true
      control.exit = { code, signal, error: control.error }
      control.endedAt = new Date().toISOString()
      fs.closeSync(stdoutFd)
      fs.closeSync(stderrFd)
      resolve(control.exit)
    })
  })
  control.waitFor = async (type, timeoutMs) => {
    const existing = control.messages.find((message) => message.type === type)
    if (existing) return existing
    let listener
    try {
      return await bounded(
        Promise.race([
          new Promise((resolve) => {
            listener = (message) => {
              if (message?.type === type) resolve(message)
            }
            child.on('message', listener)
          }),
          control.done.then(() => {
            throw new Error(`Child closed before ${type}`)
          })
        ]),
        timeoutMs,
        type
      )
    } finally {
      if (listener) child.off('message', listener)
    }
  }
  return control
}

async function stop(control, directory, owned) {
  if (control.stopping) return control.stopping
  control.stopping = (async () => {
    if (control.closed) return control.exit
    control.child.kill('SIGTERM')
    try {
      return await bounded(control.done, 2000, 'Graceful child termination')
    } catch {
      if (control.privileged && control.child.pid) {
        const killer = launch(
          '/usr/bin/sudo',
          ['-n', '/bin/kill', '-KILL', '--', `-${control.child.pid}`],
          directory,
          `kill-${control.child.pid}`,
          owned
        )
        try {
          const exit = await bounded(killer.done, 3000, 'Privileged sampler termination')
          if (exit.code !== 0)
            throw new Error('Privileged sampler termination failed; inspect private stderr')
        } finally {
          if (!killer.closed) {
            killer.child.kill('SIGKILL')
            await bounded(killer.done, 2000, 'Kill helper close')
          }
        }
      } else control.child.kill('SIGKILL')
      return bounded(control.done, 5000, 'Forced child close')
    }
  })()
  return control.stopping
}

function startWorker(config, directory, name, owned, loader) {
  const control = launch(
    process.execPath,
    ['--import', loader, scriptPath, '--worker'],
    directory,
    name,
    owned,
    { ipc: true }
  )
  control.child.send({ type: 'configure', config }, (error) => {
    if (error) control.error = String(error)
  })
  return control
}

async function fixtureOperation(role, options, directory, owned, loader) {
  const control = startWorker(
    { role, artifactRoot: directory, counts: options.counts },
    directory,
    role,
    owned,
    loader
  )
  try {
    const exit = await bounded(control.done, role === 'fixture' ? 120000 : 30000, `${role} process`)
    if (exit.code !== 0 || exit.error) throw new Error(`${role} failed; inspect private stderr`)
  } finally {
    await stop(control, directory, owned)
  }
}

async function runSample(record, options, directory, owned, loader) {
  const control = startWorker(
    { role: 'watcher', artifactRoot: directory, ...record, ...options },
    directory,
    record.id,
    owned,
    loader
  )
  let sampler
  let samplerFailure = null
  let measurement = null
  let failure = null
  let watcherClosed = false
  const sampleCount = options.windowSeconds + 2
  record.status = 'running'
  record.childPid = control.child.pid ?? null
  try {
    await control.waitFor('prepared', 15000)
    if (options.energy) {
      sampler = launch(
        '/usr/bin/sudo',
        [
          '-n',
          '/usr/bin/powermetrics',
          '--samplers',
          'tasks,cpu_power',
          '-i',
          '1000',
          '-n',
          String(sampleCount),
          '-b',
          '1',
          '--show-process-energy',
          '--show-process-coalition'
        ],
        directory,
        `${record.id}.powermetrics`,
        owned,
        { privileged: true }
      )
      try {
        await bounded(
          Promise.race([
            sampler.firstSample,
            sampler.done.then(() => {
              throw new Error('Sampler exited before its first sample')
            })
          ]),
          5000,
          'Sampler startup'
        )
      } catch (error) {
        samplerFailure = String(error)
        await stop(sampler, directory, owned)
      }
    }
    control.child.send({ type: 'start' })
    const result = await control.waitFor('measurement', options.windowSeconds * 1000 + 3000)
    measurement = result.measurement
    if (sampler && !sampler.closed) {
      try {
        await bounded(sampler.done, 5000, 'Sampler tail')
      } catch (error) {
        samplerFailure = String(error)
        await stop(sampler, directory, owned)
      }
    }
    control.child.send({ type: 'release' })
    await control.waitFor('watcher-closed', 6000)
    watcherClosed = true
    const exit = await bounded(control.done, 2000, 'Watcher process close')
    if (exit.code !== 0 || exit.error) throw new Error('Watcher child failed')
  } catch (error) {
    failure = String(error?.stack ?? error)
  } finally {
    if (sampler) {
      try {
        await stop(sampler, directory, owned)
      } catch (error) {
        samplerFailure ??= String(error)
        failure ??= String(error)
      }
    }
    try {
      await stop(control, directory, owned)
    } catch (error) {
      failure ??= String(error)
    }
  }
  const raw = {
    ...record,
    measurement,
    failure,
    watcherClosed,
    childExit: control.exit,
    childStartedAt: control.startedAt,
    childEndedAt: control.endedAt,
    messages: control.messages,
    samplerFailure,
    samplerExit: sampler?.exit ?? null,
    samplerStartedAt: sampler?.startedAt ?? null,
    samplerEndedAt: sampler?.endedAt ?? null
  }
  privateJson(path.join(directory, `${record.id}.raw.json`), raw)
  record.status =
    !failure && watcherClosed && measurement?.status === 'complete' ? 'complete' : 'failed'
  record.watcherClosed = watcherClosed
  record.childExit = control.exit
    ? { code: control.exit.code, signal: control.exit.signal, error: Boolean(control.exit.error) }
    : null
  record.privateFailureArtifact = failure ? `${record.id}.raw.json` : null
  if (measurement) {
    const { delivered: _delivered, errors: _errors, events, ...safeMetrics } = measurement
    record.measurement = {
      ...safeMetrics,
      events: events.map(({ error, ...event }) => ({ ...event, errorRecorded: Boolean(error) }))
    }
  } else {
    record.measurement = null
    record.partialRegistration =
      control.messages.find((message) => message.type === 'registration')?.registration ?? null
  }
  record.energy = sampler
    ? summarizeEnergy(
        parsePowerMetrics(fs.readFileSync(sampler.stdoutPath, 'utf8'), record.childPid),
        {
          ...sampler.exit,
          error: samplerFailure || sampler.exit?.error,
          stderr: fs.readFileSync(sampler.stderrPath, 'utf8'),
          truncated: sampler.truncated,
          expectedSamples: sampleCount
        }
      )
    : { status: options.energy ? 'not-measured' : 'disabled' }
  if (sampler) {
    record.energy.samplerStartedAt = sampler.startedAt
    record.energy.samplerEndedAt = sampler.endedAt
    record.energy.privateStderrArtifact = path.basename(sampler.stderrPath)
  }
  return record
}

async function main(options) {
  if (process.platform !== 'darwin')
    throw new Error('Real watcher comparison requires macOS; parser tests do not')
  assert.equal(
    load('chokidar-fsevents/package.json').version,
    '3.6.0',
    'Install the locked pinned baseline'
  )
  const loader = load.resolve('tsx')
  assert.ok(fs.existsSync(candidatePath), 'Production MacOSFileWatcher is not yet available')
  process.umask(0o077)
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-watch-benchmark-')))
  fs.chmodSync(directory, 0o700)
  fs.mkdirSync(path.join(directory, 'fixtures'), { mode: 0o700 })
  const owned = new Set()
  const runs = planRuns(options)
  let interrupted = false
  let fatalError = null
  let cleanupStatus = 'not-attempted'
  const sourceHash = (filePath) =>
    createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  const metadata = {
    schemaVersion: 1,
    scope,
    createdAt: new Date().toISOString(),
    options,
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      macosKernelRelease: os.release(),
      logicalCpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model,
      totalMemoryBytes: os.totalmem()
    },
    versions: {
      baseline: 'chokidar-fsevents@3.6.0',
      candidate: 'actual production MacOSFileWatcher',
      candidateSha256: sourceHash(candidatePath),
      harnessSha256: sourceHash(scriptPath)
    },
    fixture: {
      layout:
        '100 files/batch, 10 batches/group; identical admitted .txt files, depth 3, canonical root; create/change/delete latency-probe.txt removed before each sample',
      ignored: 'dot basenames and node_modules; generated fixture has neither',
      content: 'synthetic fixture\\n',
      cachePolicy:
        'Fixture generated once before all runs; OS filesystem cache is not flushed; alternating order, no discarded warmups.'
    },
    methodology: {
      window:
        'Fixed wall window begins at watcher construction/registration after module import and sampler lead-in; includes registration, three file mutations and remaining idle time. Overruns are recorded, not clipped.',
      fsOperations:
        'JavaScript fs callback/sync/promises stat/lstat/readdir calls, patched before backend import with syncBuiltinESMExports. Not native syscalls; excludes module loading and fixture creation.',
      memory:
        'Before/after heap and RSS; 50ms sampled peak may miss blocking peaks; resourceUsage.maxRSS is child lifetime high-water KiB including loader.',
      cpu: 'process.cpuUsage user+system microseconds converted to ms; percent relative to one core. Excludes tsx/module import, parent and powermetrics; includes watcher plus measurement/probe overhead.',
      energy:
        'Optional sampler is separate; child stays alive through sampler tail. Lead-in/tail and every missing PID sample retained. No application or whole-system causality claim.',
      environment:
        'NODE_OPTIONS and NODE_V8_COVERAGE disabled in children; no GC forcing or host cache/profile modification.'
    }
  }
  const persist = () => {
    const summary = {
      ...metadata,
      interrupted,
      cleanupStatus,
      fatalErrorRecorded: Boolean(fatalError),
      status:
        !fatalError &&
        !interrupted &&
        cleanupStatus === 'complete' &&
        runs.every(
          (run) =>
            run.status === 'complete' && (!options.energy || run.energy?.status === 'complete')
        )
          ? 'complete'
          : 'incomplete',
      runs,
      comparisons: summarizeRuns(runs),
      artifacts: {
        privateDirectoryBasename: path.basename(directory),
        location: 'os.tmpdir()',
        publicFile: 'summary.redacted.json',
        warning:
          'All other artifacts are private. Raw powermetrics includes unrelated process names and local paths; do not upload.'
      }
    }
    privateJson(path.join(directory, 'summary.redacted.json'), summary)
    return summary
  }
  const onSignal = () => {
    interrupted = true
    for (const control of owned)
      void stop(control, directory, owned).catch((error) => {
        fatalError ??= String(error)
      })
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  process.stderr.write(
    `Private artifacts: os.tmpdir()/${path.basename(directory)}; share only summary.redacted.json\n`
  )
  persist()
  try {
    await fixtureOperation('fixture', options, directory, owned, loader)
    await delay(1500)
    for (const record of runs) {
      if (interrupted) break
      const probePath = path.join(
        directory,
        'fixtures',
        `files-${record.fileCount}`,
        'latency-probe.txt'
      )
      fs.rmSync(probePath, { force: true })
      await delay(500)
      if (interrupted) break
      await runSample(record, options, directory, owned, loader)
      persist()
      process.stderr.write(`${record.id}: ${record.status}; energy=${record.energy.status}\n`)
    }
  } catch (error) {
    fatalError = String(error?.stack ?? error)
  } finally {
    try {
      for (const control of owned) await stop(control, directory, owned)
      await fixtureOperation('cleanup', options, directory, owned, loader)
      cleanupStatus = 'complete'
    } catch (error) {
      fatalError ??= String(error?.stack ?? error)
      cleanupStatus = 'failed-retained-private-fixture'
    }
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    privateJson(path.join(directory, 'lifecycle.raw.json'), {
      fatalError,
      cleanupStatus,
      children: [...owned].map((control) => ({
        pid: control.child.pid,
        startedAt: control.startedAt,
        endedAt: control.endedAt,
        closed: control.closed,
        exit: control.exit,
        error: control.error,
        truncated: control.truncated
      }))
    })
  }
  const summary = persist()
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  process.exitCode = summary.status === 'complete' ? 0 : 1
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv[2] === '--worker' && process.send) {
    workerMain().catch((error) => {
      send({ type: 'failed', error: String(error?.stack ?? error) })
      process.stderr.write(`${error?.stack ?? error}\n`, () => process.exit(1))
    })
  } else {
    try {
      const options = parseArgs(process.argv.slice(2))
      if (options.help) process.stdout.write(usage)
      else await main(options)
    } catch {
      process.stderr.write(
        'Benchmark CLI/preflight failed; use --help, macOS, locked dependencies and the production watcher module. No successful measurement claimed.\n'
      )
      process.exitCode = 2
    }
  }
}
