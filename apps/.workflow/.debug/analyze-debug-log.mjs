import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function readJson(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'))
  }
  catch {
    return null
  }
}

function readNdjson(filepath) {
  if (!fs.existsSync(filepath)) {
    return []
  }
  const content = fs.readFileSync(filepath, 'utf8')
  const lines = content.split('\n').filter(Boolean)
  const entries = []
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line))
    }
    catch {
      // skip
    }
  }
  return entries
}

function groupBy(arr, key) {
  const map = new Map()
  for (const item of arr) {
    const k = item?.[key] ?? 'UNKNOWN'
    const bucket = map.get(k) ?? []
    bucket.push(item)
    map.set(k, bucket)
  }
  return map
}

function maxOf(arr, selector) {
  let max = -Infinity
  let maxItem = null
  for (const item of arr) {
    const v = selector(item)
    if (Number.isFinite(v) && v > max) {
      max = v
      maxItem = item
    }
  }
  return { max, maxItem }
}

const activePath = path.join(__dirname, 'active-session.json')
const active = readJson(activePath)
if (!active?.enabled || typeof active.sid !== 'string') {
  console.error(`[workflow-debug] active session disabled or invalid: "${activePath}"`)
  process.exit(1)
}

const sid = active.sid
const logPath = path.join(__dirname, sid, 'debug.log')
const entries = readNdjson(logPath)

console.log(`[workflow-debug] sid=${sid}`)
console.log(`[workflow-debug] log=${logPath}`)
console.log(`[workflow-debug] entries=${entries.length}`)

const byHid = groupBy(entries, 'hid')
console.log('\n== By Hypothesis ==')
for (const [hid, logs] of Array.from(byHid.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
  console.log(`- ${hid}: ${logs.length}`)
}

function printTop(name, filtered, selector, format) {
  const { max, maxItem } = maxOf(filtered, selector)
  if (!Number.isFinite(max) || max <= 0 || !maxItem) {
    return
  }
  console.log(`\n== Top ${name} ==`)
  console.log(format(maxItem))
}

const h2 = (byHid.get('H2') ?? []).filter(e => e?.data?.durationMs !== undefined)
printTop(
  'renderer send / perf report',
  h2,
  e => Number(e?.data?.durationMs),
  e => JSON.stringify({ msg: e.msg, eventName: e?.data?.eventName, durationMs: e?.data?.durationMs, syncId: e?.data?.syncId ?? e?.data?.meta?.syncId, ts: e.ts }, null, 2),
)

const h1 = byHid.get('H1') ?? []
const h1Sections = h1.filter(e => e.msg === 'section.timing')
const bySection = groupBy(h1Sections.map(e => ({ ...e, section: e?.data?.section })), 'section')
console.log('\n== H1 section timing ==')
for (const [section, logs] of Array.from(bySection.entries())) {
  const { max } = maxOf(logs, e => Number(e?.data?.durationMs))
  if (!Number.isFinite(max)) continue
  console.log(`- ${section}: max=${Math.round(max)}ms count=${logs.length}`)
}

const h3 = byHid.get('H3') ?? []
printTop(
  'reply serialize bytes',
  h3,
  e => Number(e?.data?.bytes),
  e => JSON.stringify({ bytes: e?.data?.bytes, encodeMs: e?.data?.encodeDurationMs, parseMs: e?.data?.parseDurationMs, requestId: e?.data?.requestId, ts: e.ts }, null, 2),
)

const h4 = byHid.get('H4') ?? []
printTop(
  'event loop lag',
  h4,
  e => Number(e?.data?.lagMs),
  e => JSON.stringify({ lagMs: e?.data?.lagMs, severity: e?.data?.severity, ts: e.ts, lastSlowIpc: e?.data?.lastSlowIpc }, null, 2),
)

const h5 = byHid.get('H5') ?? []
printTop(
  'logs scan statDurationMs',
  h5,
  e => Number(e?.data?.statDurationMs),
  e => JSON.stringify({ filesCount: e?.data?.filesCount, statDurationMs: e?.data?.statDurationMs, readDirDurationMs: e?.data?.readDirDurationMs, logsDir: e?.data?.logsDir, ts: e.ts }, null, 2),
)

const h6 = byHid.get('H6') ?? []
printTop(
  'ui signal duration',
  h6,
  e => Number(e?.data?.durationMs),
  e => JSON.stringify({ msg: e.msg, eventName: e?.data?.eventName, durationMs: e?.data?.durationMs, ts: e.ts }, null, 2),
)
