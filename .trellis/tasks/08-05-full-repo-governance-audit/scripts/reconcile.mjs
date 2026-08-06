#!/usr/bin/env node
// Reconcile the local ledger (filed.jsonl) against reality on GitHub before a
// mop-up run. The background filer can hit "Post .../graphql: EOF" on the
// RESPONSE after the issue was actually created — it logs that as FAILED and does
// NOT ledger it, so a naive re-run would create a DUPLICATE. This script fetches
// all live `audit`-labeled issue titles and, for any finding whose title already
// exists as an issue, appends it to the ledger so the mop-up skips it.
//
// Exact normalized-title match only (agent titles are <=100 chars so the filer's
// 250-char truncation never fires) — precise, no false positives that would drop
// a real finding.
//
// Usage: node reconcile.mjs

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TASK_DIR = path.resolve(__dirname, '..')
const FINDINGS = path.join(TASK_DIR, 'research', 'findings.jsonl')
const LEDGER = path.join(TASK_DIR, 'research', 'filed.jsonl')

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'on', 'and', 'or', 'for', 'is', 'are', 'be', 'when', 'with', 'without', 'not', 'no'])
function norm(title) {
  return String(title || '').toLowerCase()
    .replace(/^\[audit\/[^\]]+\]\s*/, '')          // strip the [audit/<domain>] prefix
    .replace(/[^a-z0-9一-鿿\s]/g, ' ')
    .split(/\s+/).filter((w) => w && !STOP.has(w)).join(' ')
}
const STOPk = STOP
function keyOf(f) {
  const t = String(f.title || '').toLowerCase().replace(/[^a-z0-9一-鿿\s]/g, ' ')
    .split(/\s+/).filter((w) => w && !STOPk.has(w)).join(' ')
  return `${(f.file || '').trim()}::${t}`
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

const findings = readJsonl(FINDINGS)
const ledger = readJsonl(LEDGER)
const doneKeys = new Set(ledger.map((e) => e.key))

let live = []
try {
  const out = execFileSync('gh', ['issue', 'list', '--label', 'audit', '--state', 'all', '--limit', '1000', '--json', 'number,title,url'], { encoding: 'utf8' })
  live = JSON.parse(out)
} catch (e) {
  console.error(`could not list audit issues: ${e.message}`); process.exit(1)
}

// map normalized-title -> issue
const byTitle = new Map()
for (const it of live) byTitle.set(norm(it.title), it)

let reconciled = 0
for (const f of findings) {
  const key = keyOf(f)
  if (doneKeys.has(key)) continue
  const hit = byTitle.get(norm(f.title))
  if (hit) {
    fs.appendFileSync(LEDGER, `${JSON.stringify({ key, number: hit.number, url: hit.url, title: hit.title, reconciled: true })}\n`)
    doneKeys.add(key)
    reconciled++
  }
}

console.log(`live audit issues: ${live.length}`)
console.log(`ledger before:     ${ledger.length}`)
console.log(`reconciled (created-but-unledgered): ${reconciled}`)
console.log(`ledger after:      ${ledger.length + reconciled}`)
