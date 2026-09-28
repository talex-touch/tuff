const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')
const { performance, monitorEventLoopDelay } = require('node:perf_hooks')
const { setTimeout: delay } = require('node:timers/promises')

const packageRoot = process.argv[2]
if (!packageRoot || process.platform !== 'darwin') {
  throw new Error('Usage on macOS: node watcher-startup-probe.cjs <isolated-package-directory>')
}

const counts = { stat: 0, lstat: 0, readdir: 0 }
for (const name of Object.keys(counts)) {
  const original = fs[name]
  fs[name] = function (...args) {
    counts[name] += 1
    return original.apply(this, args)
  }
}

const load = createRequire(path.resolve(packageRoot, 'package.json'))
const chokidar = load('chokidar')
const fsevents = load('fsevents')
assert.equal(load('chokidar/package.json').version, '3.6.0')
assert.equal(load('fsevents/package.json').version, '2.3.3')

function createFixture(root, fileCount) {
  for (let fileIndex = 0; fileIndex < fileCount; fileIndex += 1) {
    const directory = path.join(root, `group-${Math.floor(fileIndex / 1000)}`, `batch-${Math.floor(fileIndex / 100)}`)
    if (fileIndex % 100 === 0) fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, `file-${fileIndex}.txt`), '')
  }
}

async function measure(backend, root, fileCount, repeat) {
  for (const name of Object.keys(counts)) counts[name] = 0
  const eventLoop = monitorEventLoopDelay({ resolution: 10 })
  eventLoop.enable()
  const beforeCpu = process.cpuUsage()
  const beforeMemory = process.memoryUsage()
  const started = performance.now()
  const probePath = path.join(root, `freshness-${backend}-${repeat}.txt`)
  let deliveredAt = null
  let close = async () => {}
  let startupTimer

  try {
    if (backend === 'chokidar') {
      const watcher = chokidar.watch(root, {
        persistent: true,
        ignoreInitial: true,
        depth: 24,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
      })
      close = () => watcher.close()
      watcher.on('add', changedPath => {
        if (changedPath === probePath) deliveredAt = performance.now()
      })
      await Promise.race([
        new Promise((resolve, reject) => {
          watcher.once('ready', resolve)
          watcher.once('error', reject)
        }),
        new Promise((resolve, reject) => {
          startupTimer = setTimeout(() => reject(new Error('Watcher readiness timeout')), 30000)
        })
      ])
      clearTimeout(startupTimer)
    } else {
      const stop = fsevents.watch(root, changedPath => {
        if (changedPath === probePath) deliveredAt = performance.now()
      })
      close = stop
    }

    const readyMs = performance.now() - started
    await delay(500)
    const cpu = process.cpuUsage(beforeCpu)
    const startupFsCalls = { ...counts }
    const result = {
      backend,
      fileCount,
      repeat,
      readyMs: Math.round(readyMs),
      observedMs: Math.round(performance.now() - started),
      cpuMs: Math.round((cpu.user + cpu.system) / 1000),
      heapDeltaMiB: Math.round((process.memoryUsage().heapUsed - beforeMemory.heapUsed) / 1024 / 1024),
      maxEventLoopDelayMs: Math.round(eventLoop.max / 1e6),
      startupFsCalls,
      exceedsRegistrationBudget: Object.values(startupFsCalls).reduce((sum, value) => sum + value, 0) > 64
    }
    eventLoop.disable()
    const createdAt = performance.now()
    fs.writeFileSync(probePath, 'synthetic watcher probe')
    const deadline = createdAt + 5000
    while (deliveredAt === null && performance.now() < deadline) await delay(25)
    result.creationDelivered = deliveredAt !== null
    result.creationLatencyMs = deliveredAt === null ? null : Math.round(deliveredAt - createdAt)
    assert.equal(result.creationDelivered, true, `${backend} failed to observe a newly created file`)
    return result
  } finally {
    clearTimeout(startupTimer)
    eventLoop.disable()
    await close()
    if (fs.existsSync(probePath)) fs.unlinkSync(probePath)
  }
}

async function main() {
  const fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-watcher-fixture-')))
  fs.chmodSync(fixtureRoot, 0o700)
  const results = []
  try {
    for (const fileCount of [2000, 20000]) {
      const root = path.join(fixtureRoot, `files-${fileCount}`)
      createFixture(root, fileCount)
      await delay(1000)
      for (let repeat = 1; repeat <= 3; repeat += 1) {
        const order = repeat % 2 === 1 ? ['chokidar', 'native-fsevents'] : ['native-fsevents', 'chokidar']
        for (const backend of order) {
          const result = await measure(backend, root, fileCount, repeat)
          results.push(result)
          process.stdout.write(`${JSON.stringify(result)}\n`)
          await delay(250)
        }
      }
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
  process.stdout.write(`${JSON.stringify({summary: {platform: process.platform, arch: process.arch, node: process.version, runs: results.length, watcherBaselineExceededBudget: results.filter(result => result.backend === 'chokidar').every(result => result.exceedsRegistrationBudget), rawNativeRegistrationWithinBudget: results.filter(result => result.backend === 'native-fsevents').every(result => !result.exceedsRegistrationBudget), limitations: 'Raw native API is a registration lower bound, not an implemented replacement. No application database, app event routing, exclusions, rename/delete handling, or full startup behavior is tested.'}})}\n`)
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
})
