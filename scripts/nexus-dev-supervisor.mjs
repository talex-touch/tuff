#!/usr/bin/env node
/**
 * Nexus dev supervisor — keeps `nuxt dev` alive without anyone babysitting it.
 *
 * Why this exists: the Nexus dev server leaks heap on every in-process Nuxt reload
 * (any external `nuxt prepare` / `pnpm install` / tuffex build wipes `.nuxt/dist`,
 * which the dev server answers with a full in-process rebuild). With the default
 * 4 GB V8 ceiling it therefore dies with `Ineffective mark-compacts` after roughly
 * a dozen reloads, and each death leaves an orphaned `workerd` behind.
 *
 * Instead of asking people to remember rules, this wrapper:
 *   - respawns the dev server whenever it exits (OOM abort, SIGKILL, crash);
 *   - restarts it *proactively* when the process tree's RSS crosses a limit
 *     (default 4600 MB ≈ ~2.8 GB V8 heap) so the fatal GC-thrash window never hits;
 *   - restarts it when it stops answering HTTP for a few consecutive checks
 *     (covers the "process alive, port dark / serving 503 forever" zombie state);
 *   - reclaims the port from a stale listener of the same app before listening;
 *   - reaps orphaned `workerd` / esbuild helpers left by previous incarnations;
 *   - rotates the log file so a long-lived server cannot fill the disk.
 *
 * Usage:
 *   node scripts/nexus-dev-supervisor.mjs [--app <dir>] [--port 3200]
 *   node scripts/nexus-dev-supervisor.mjs --app ~/orca/workspaces/talex-touch/design/apps/nexus
 *
 * Flags (all optional):
 *   --app <dir>          app dir to run (default <repo>/apps/nexus)
 *   --port <n>           listen port (default 3200)
 *   --heap-mb <n>        V8 old-space ceiling for the child (default 4096)
 *   --rss-limit <mb>     proactive restart threshold for the whole tree (default 4600)
 *   --log <file>         log file (default /tmp/nexus-dev-<port>.log)
 *   --health-interval <s> health probe period (default 15)
 *   --unhealthy-limit <n> consecutive failed probes before restart (default 4)
 *   --startup-timeout <s> how long a fresh child may take to answer (default 300)
 *   --cloudflare-env <e> CLOUDFLARE_DEV_ENVIRONMENT (default preview)
 *   --once               supervise a single incarnation, then exit with its status
 */

import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, renameSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_LOG_BYTES = 32 * 1024 * 1024

const opts = parseArgs(process.argv.slice(2))
const appDir = resolve(opts.app ?? join(REPO_ROOT, 'apps/nexus'))
const port = Number(opts.port ?? 3200)
const heapMb = Number(opts['heap-mb'] ?? 4096)
const rssLimitMb = Number(opts['rss-limit'] ?? 4600)
const logFile = opts.log ?? `/tmp/nexus-dev-${port}.log`
const healthIntervalS = Number(opts['health-interval'] ?? 15)
const unhealthyLimit = Number(opts['unhealthy-limit'] ?? 4)
const startupTimeoutS = Number(opts['startup-timeout'] ?? 300)
const cloudflareEnv = opts['cloudflare-env'] ?? 'preview'
const once = opts.once === true

const nuxtBin = join(appDir, 'node_modules/nuxt/bin/nuxt.mjs')
const appRoot = resolve(appDir, '..', '..')
let stopRequested = false
let child = null

/** Signal handlers flip this from outside the loops; read it through a call so the guard stays live. */
const isStopping = () => stopRequested

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (stopRequested)
      return
    stopRequested = true
    log(`received ${signal} — shutting down`)
    if (child?.pid)
      killTree(child.pid)
    process.exit(0)
  })
}

const sleepMs = ms => sleep(ms)
const stamp = () => new Date().toISOString().slice(11, 19)

function log(message) {
  const line = `[supervisor ${stamp()}] ${message}`
  process.stdout.write(`${line}\n`)
  rotateLog()
  try {
    appendFileSync(logFile, `${line}\n`)
  }
  catch {}
}

function rotateLog() {
  try {
    if (statSync(logFile).size > MAX_LOG_BYTES)
      renameSync(logFile, `${logFile}.1`)
  }
  catch {}
}

function pipeToLog(stream) {
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    process.stdout.write(chunk)
    rotateLog()
    try {
      appendFileSync(logFile, chunk)
    }
    catch {}
  })
}

/** `ps` snapshot: every process with its parent, RSS (KB) and command line. */
function psSnapshot() {
  const out = execFileSync('ps', ['-eo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  return out
    .split('\n')
    .map(parsePsLine)
    .filter(Boolean)
}

/**
 * `ps -eo pid=,ppid=,rss=,command=` → three numbers followed by a command that may itself contain
 * spaces. Slice the first three fields off instead of regexing them: `\s+` next to `.*` backtracks.
 */
function parsePsLine(line) {
  const fields = []
  let rest = line.trimStart()
  for (let index = 0; index < 3; index += 1) {
    const space = rest.indexOf(' ')
    if (space === -1)
      return null
    fields.push(rest.slice(0, space))
    rest = rest.slice(space + 1).trimStart()
  }
  return { pid: Number(fields[0]), ppid: Number(fields[1]), rssKb: Number(fields[2]), command: rest }
}

/** Combined RSS of a process and all of its descendants, in MB. */
function treeRssMb(rootPid) {
  const procs = psSnapshot()
  const byParent = new Map()
  for (const proc of procs) {
    const list = byParent.get(proc.ppid) ?? []
    list.push(proc)
    byParent.set(proc.ppid, list)
  }
  let totalKb = 0
  const queue = [rootPid]
  while (queue.length) {
    const pid = queue.pop()
    const self = procs.find(proc => proc.pid === pid)
    if (self)
      totalKb += self.rssKb
    for (const childProc of byParent.get(pid) ?? []) queue.push(childProc.pid)
  }
  return Math.round(totalKb / 1024)
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}

/** SIGTERM then SIGKILL the child's whole process group. */
function killTree(pid) {
  if (!pid || !pidAlive(pid))
    return
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    try {
      process.kill(-pid, signal)
    }
    catch {
      try {
        process.kill(pid, signal)
      }
      catch {}
    }
    const deadline = Date.now() + 6000
    while (pidAlive(pid) && Date.now() < deadline) execFileSync('sleep', ['0.2'])
  }
}

function listenersOnPort(targetPort) {
  try {
    return execFileSync('lsof', ['-nP', `-iTCP:${targetPort}`, '-sTCP:LISTEN', '-F', 'pc'], { encoding: 'utf8' })
      .split('\n')
      .filter(line => line.startsWith('p'))
      .map(line => Number(line.slice(1)))
  }
  catch {
    return []
  }
}

function commandOf(pid) {
  return psSnapshot().find(proc => proc.pid === pid)?.command ?? ''
}

function cwdOf(pid) {
  try {
    const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' })
    return out.split('\n').find(line => line.startsWith('n'))?.slice(1) ?? ''
  }
  catch {
    return ''
  }
}

/**
 * A listener counts as ours when it is (or was, before being orphaned) a dev server
 * of this app: absolute path in the command line, cwd inside the app, or a
 * parentless nuxt process left behind by a killed dev server.
 */
function isOurDevServer(pid) {
  const command = commandOf(pid)
  if (command.includes(appRoot) || command.includes(appDir))
    return true
  const cwd = cwdOf(pid)
  if (cwd && resolve(cwd) === appDir)
    return true
  return psSnapshot().find(proc => proc.pid === pid)?.ppid === 1 && /nuxt/.test(command)
}

/** Walking up the parent chain: is this listener already owned by another supervisor? */
function managedByAnotherSupervisor(pid) {
  const procs = psSnapshot()
  const byPid = new Map(procs.map(proc => [proc.pid, proc]))
  let current = byPid.get(pid)
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (current.command.includes('nexus-dev-supervisor.mjs'))
      return true
    current = byPid.get(current.ppid)
  }
  return false
}

/**
 * Free the port before listening. Only app-owned leftovers are killed — a foreign
 * listener is reported and retried instead of being taken down behind someone's back.
 */
function reclaimPort() {
  for (const pid of listenersOnPort(port)) {
    if (managedByAnotherSupervisor(pid)) {
      return {
        ok: false,
        code: 'managed',
        message: `port ${port} is already served by a supervised dev server (pid ${pid}) — leaving it alone`,
      }
    }
    if (!isOurDevServer(pid)) {
      return {
        ok: false,
        code: 'foreign',
        message: `port ${port} is held by pid ${pid} (${commandOf(pid).slice(0, 110) || 'unknown command'}), which is not this app's dev server — refusing to kill it`,
      }
    }
    log(`port ${port} held by stale listener pid ${pid} of this app — killing it`)
    killTree(pid)
  }
  const deadline = Date.now() + 60_000
  while (listenersOnPort(port).length && Date.now() < deadline) execFileSync('sleep', ['1'])
  if (listenersOnPort(port).length)
    return { ok: false, code: 'busy', message: `port ${port} is still busy after 60s` }
  return { ok: true }
}

/** Orphaned helpers (workerd / esbuild) left behind by a dead dev server. */
function reapOrphans() {
  let reaped = 0
  for (const proc of psSnapshot()) {
    if (proc.ppid !== 1)
      continue
    if (!proc.command.includes(appRoot))
      continue
    if (!/workerd|esbuild/.test(proc.command))
      continue
    try {
      process.kill(proc.pid, 'SIGTERM')
      reaped += 1
    }
    catch {}
  }
  if (reaped)
    log(`reaped ${reaped} orphaned helper process(es)`)
}

/**
 * The dev server binds the IPv6 loopback only (`[::1]`), so probe every loopback
 * spelling — remembering the one that worked so a healthy check stays cheap.
 */
let healthyBase = null
async function probe(base) {
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(5000) })
    return res.status < 400
  }
  catch {
    return false
  }
}

async function httpServing() {
  const bases = [`http://localhost:${port}/`, `http://[::1]:${port}/`, `http://127.0.0.1:${port}/`]
  const ordered = healthyBase ? [healthyBase, ...bases.filter(base => base !== healthyBase)] : bases
  for (const base of ordered) {
    if (await probe(base)) {
      healthyBase = base
      return true
    }
  }
  healthyBase = null
  return false
}

/** Runs one incarnation and resolves with the reason it must be replaced. */
async function supervise(proc) {
  let exit = null
  proc.on('exit', (code, signal) => {
    exit = signal ? `signal ${signal}` : `exit ${code}`
  })

  const startupDeadline = Date.now() + startupTimeoutS * 1000
  while (Date.now() < startupDeadline) {
    if (exit)
      return `exited during startup (${exit})`
    if (await httpServing())
      break
    await sleepMs(2000)
  }
  if (exit)
    return `exited during startup (${exit})`
  if (!(await httpServing()))
    return `never served within ${startupTimeoutS}s`
  log(`up on http://localhost:${port}/ (heap ceiling ${heapMb} MB, restart at ${rssLimitMb} MB RSS)`)

  let unhealthy = 0
  while (!isStopping()) {
    await sleepMs(healthIntervalS * 1000)
    if (exit)
      return `exited (${exit})`
    const rss = treeRssMb(proc.pid)
    if (rss >= rssLimitMb)
      return `rss ${rss} MB ≥ ${rssLimitMb} MB (proactive restart before the heap ceiling)`
    if (await httpServing()) {
      unhealthy = 0
    }
    else if (++unhealthy >= unhealthyLimit) {
      return `unhealthy for ${unhealthy} consecutive probes (~${(unhealthy * healthIntervalS).toFixed(0)}s)`
    }
  }
  return 'shutdown'
}

reapOrphans()

let attempt = 0
while (!isStopping()) {
  const claim = reclaimPort()
  if (!claim.ok) {
    log(claim.message)
    // Somebody's supervisor already serves this port: Nexus is up, so `pnpm nexus:dev` has
    // nothing to add. Exit 0 instead of holding the terminal in a retry loop.
    if (claim.code === 'managed')
      process.exit(0)
    if (opts.once)
      process.exit(2)
    log('retrying in 30s — free that port, or restart with --port <other>')
    await sleepMs(30_000)
    continue
  }
  attempt += 1
  rotateLog()
  log(`starting nuxt dev #${attempt} in ${appDir}`)
  child = spawn(process.execPath, [nuxtBin, 'dev', '--port', String(port)], {
    cwd: appDir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NUXT_USE_CLOUDFLARE_DEV: 'true',
      CLOUDFLARE_DEV_ENVIRONMENT: cloudflareEnv,
      // sidebase/nuxt-auth warns AUTH_NO_ORIGIN when a worktree has no .env.local;
      // the dev server always lives on this port, so derive it instead of asking people to.
      AUTH_ORIGIN: process.env.AUTH_ORIGIN ?? `http://localhost:${port}`,
      NODE_OPTIONS: `--max-old-space-size=${heapMb}`,
    },
  })
  pipeToLog(child.stdout)
  pipeToLog(child.stderr)

  const reason = await supervise(child)
  killTree(child.pid)
  reapOrphans()
  child = null
  log(`restarting because ${reason}`)
  if (once)
    process.exit(reason === 'shutdown' ? 0 : 1)
  if (isStopping())
    break
  const backoff = Math.min(5 + attempt * 5, 60)
  await sleepMs(backoff * 1000)
}

function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--'))
      continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) {
      parsed[key] = true
    }
    else {
      parsed[key] = next
      index += 1
    }
  }
  return parsed
}
