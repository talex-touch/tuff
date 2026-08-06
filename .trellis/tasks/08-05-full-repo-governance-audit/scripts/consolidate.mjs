#!/usr/bin/env node
// Merge all research/audit/*.jsonl (agent + peer findings) into a single
// deduped, schema-valid research/findings.jsonl ready for the filer.
//
// - Drops lines missing required fields (file, title, evidence, failure_scenario).
// - Dedups by (file, normalized-title); keeps the highest-severity copy.
// - Cross-checks titles against currently-open GitHub issues and FLAGS likely
//   dupes (does not drop them — writes them to research/possible-dupes.jsonl for review).
// - Prints stats by domain / severity / confidence.
//
// Usage: node consolidate.mjs [--keep-plausible]

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TASK_DIR = path.resolve(__dirname, '..')
const AUDIT_DIR = path.join(TASK_DIR, 'research', 'audit')
const OUT = path.join(TASK_DIR, 'research', 'findings.jsonl')
const DUPES = path.join(TASK_DIR, 'research', 'possible-dupes.jsonl')
const DROPPED = path.join(TASK_DIR, 'research', 'dropped.jsonl')
const LEDGER = path.join(TASK_DIR, 'research', 'filed.jsonl')

const KEEP_PLAUSIBLE = process.argv.includes('--keep-plausible')
const REQUIRED = ['file', 'title', 'evidence', 'failure_scenario']
const SEV_RANK = { high: 3, medium: 2, low: 1 }
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'on', 'and', 'or', 'for', 'is', 'are', 'be', 'when', 'with', 'without', 'not', 'no'])

function norm(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9一-鿿\s]/g, ' ')
    .split(/\s+/).filter((w) => w && !STOP.has(w)).join(' ')
}
const keyOf = (f) => `${(f.file || '').trim()}::${norm(f.title)}`

function readAll() {
  if (!fs.existsSync(AUDIT_DIR)) return []
  const files = fs.readdirSync(AUDIT_DIR).filter((f) => f.endsWith('.jsonl'))
  const out = []
  for (const file of files) {
    const full = path.join(AUDIT_DIR, file)
    const lines = fs.readFileSync(full, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    lines.forEach((l, i) => {
      try { out.push({ ...JSON.parse(l), _src: file, _ln: i + 1 }) }
      catch (e) { console.error(`  ! bad JSON ${file}:${i + 1}: ${e.message}`) }
    })
  }
  return out
}

function openIssueTitles() {
  try {
    const out = execFileSync('gh', ['issue', 'list', '--state', 'open', '--limit', '500', '--json', 'number,title'], { encoding: 'utf8' })
    return JSON.parse(out).map((x) => ({ number: x.number, norm: norm(x.title) }))
  } catch (e) {
    console.error(`  ! could not list open issues: ${e.message}`)
    return []
  }
}

// token-overlap similarity for dup flagging
function overlap(a, b) {
  const A = new Set(a.split(' ').filter(Boolean))
  const B = new Set(b.split(' ').filter(Boolean))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / Math.min(A.size, B.size)
}

const all = readAll()
const dropped = []
const valid = all.filter((f) => {
  const miss = REQUIRED.filter((k) => !f[k] || String(f[k]).trim() === '')
  if (miss.length) { dropped.push({ ...f, _drop: `missing:${miss.join(',')}` }); return false }
  if (!KEEP_PLAUSIBLE && f.confidence === 'plausible') { /* keep by default; flag only */ }
  return true
})

// ledger-aware dedup: prefer an already-filed copy so a merge never drops the
// filed one and re-files the other (which would duplicate the issue on GitHub).
const ledgerKeys = new Set(
  (fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean) : [])
    .map((l) => { try { return JSON.parse(l).key } catch { return null } }).filter(Boolean),
)
const isFiled = (f) => ledgerKeys.has(keyOf(f))
const better = (a, b) => {
  if (isFiled(a) && !isFiled(b)) return a
  if (isFiled(b) && !isFiled(a)) return b
  return (SEV_RANK[b.severity] || 0) > (SEV_RANK[a.severity] || 0) ? b : a
}

// pass 1: dedup by (file, normalized-title)
const byKey = new Map()
for (const f of valid) {
  const k = keyOf(f)
  byKey.set(k, byKey.has(k) ? better(byKey.get(k), f) : f)
}
let deduped = [...byKey.values()]

// pass 2: merge findings on the exact same (file, line) when titles are topically
// related (>=0.35 token overlap) — catches two agents flagging the same defect with
// different wording (e.g. peer-a2 + audit-security both on main-transport.ts:710).
const byLoc = new Map()
const noLoc = []
for (const f of deduped) {
  const ln = Number(f.line)
  if (!ln || ln <= 0) { noLoc.push(f); continue }
  const k = `${(f.file || '').trim()}#${ln}`
  const prev = byLoc.get(k)
  if (!prev) byLoc.set(k, f)
  else if (overlap(norm(prev.title), norm(f.title)) >= 0.35) byLoc.set(k, better(prev, f))
  else noLoc.push(f) // same line but unrelated -> keep both
}
deduped = [...noLoc, ...byLoc.values()]

// flag likely dupes vs open issues
const open = openIssueTitles()
const dupes = []
for (const f of deduped) {
  const nt = norm(f.title)
  const hit = open.find((o) => overlap(nt, o.norm) >= 0.6)
  if (hit) dupes.push({ number: hit.number, title: f.title, file: f.file, key: keyOf(f) })
}

// write outputs (strip internal fields)
const clean = deduped.map(({ _src, _ln, ...rest }) => rest)
fs.writeFileSync(OUT, clean.map((f) => JSON.stringify(f)).join('\n') + (clean.length ? '\n' : ''))
fs.writeFileSync(DUPES, dupes.map((d) => JSON.stringify(d)).join('\n') + (dupes.length ? '\n' : ''))
fs.writeFileSync(DROPPED, dropped.map((d) => JSON.stringify(d)).join('\n') + (dropped.length ? '\n' : ''))

// stats
const by = (arr, key) => arr.reduce((m, f) => { const k = f[key] || '—'; m[k] = (m[k] || 0) + 1; return m }, {})
console.log(`\n=== consolidate ===`)
console.log(`raw lines:        ${all.length}`)
console.log(`dropped (schema): ${dropped.length}  -> research/dropped.jsonl`)
console.log(`after dedup:      ${deduped.length}  -> research/findings.jsonl`)
console.log(`possible dupes:   ${dupes.length}  -> research/possible-dupes.jsonl (review before filing)`)
console.log(`\nby domain_label:`, by(deduped, 'domain_label'))
console.log(`by severity:    `, by(deduped, 'severity'))
console.log(`by confidence:  `, by(deduped, 'confidence'))
console.log(`by source file: `, by(all, '_src'))
