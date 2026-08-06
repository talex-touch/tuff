#!/usr/bin/env node
// Resumable GitHub issue filer for the full-repo governance audit.
// Reads research/findings.jsonl, files one issue per finding via `gh`,
// records results to research/filed.jsonl so re-runs skip already-filed items.
//
// Usage:
//   node audit-file-issues.mjs --dry-run            # print, create nothing
//   node audit-file-issues.mjs --dry-run --limit 20 # sample
//   node audit-file-issues.mjs                      # file for real
//   node audit-file-issues.mjs --limit 50           # file first 50 new
//
// Flags: --dry-run, --limit N, --sleep MS (default 2500), --repo owner/name

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TASK_DIR = path.resolve(__dirname, '..')
const RESEARCH = path.join(TASK_DIR, 'research')
const FINDINGS = path.join(RESEARCH, 'findings.jsonl')
const LEDGER = path.join(RESEARCH, 'filed.jsonl')

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity
const SLEEP = args.includes('--sleep') ? Number(args[args.indexOf('--sleep') + 1]) : 2500
const REPO = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : null

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function readJsonl(file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      try { return JSON.parse(l) }
      catch (e) { console.error(`  ! bad JSON at ${path.basename(file)}:${i + 1}: ${e.message}`); return null }
    })
    .filter(Boolean)
}

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'on', 'and', 'or', 'for', 'is', 'are', 'be', 'when', 'with', 'without'])
function keyOf(f) {
  const t = String(f.title || '').toLowerCase().replace(/[^a-z0-9一-鿿\s]/g, ' ')
    .split(/\s+/).filter((w) => w && !STOP.has(w)).join(' ')
  return `${(f.file || '').trim()}::${t}`
}

// Discover which labels actually exist so `gh` never rejects an unknown one.
function existingLabels() {
  try {
    const out = execFileSync('gh', ['label', 'list', '--limit', '200', '--json', 'name'], { encoding: 'utf8' })
    return new Set(JSON.parse(out).map((x) => x.name))
  } catch (e) {
    console.error(`  ! could not list labels: ${e.message}`)
    return new Set()
  }
}

// Exact full-title set of issues already on GitHub — prevents re-creating a
// created-but-unledgered orphan or an exact-title duplicate. Exact match only
// (no normalization) so it never false-drops a different finding.
function liveIssueTitles() {
  try {
    const out = execFileSync('gh', ['issue', 'list', '--label', 'audit', '--state', 'all', '--limit', '1000', '--json', 'title'], { encoding: 'utf8' })
    return new Set(JSON.parse(out).map((x) => x.title))
  } catch (e) {
    console.error(`  ! could not list live titles: ${e.message}`)
    return new Set()
  }
}

function buildLabels(f, known) {
  const lowConf = f.confidence === 'low' || f.confidence === 'plausible'
  const raw = ['audit', f.domain_label || f.domain, f.type_label, ...(f.extra_labels || []), ...(lowConf ? ['question'] : [])]
  const seen = new Set()
  const out = []
  for (const l of raw) {
    if (!l) continue
    const name = String(l).trim()
    if (seen.has(name)) continue
    seen.add(name)
    if (known.size === 0 || known.has(name)) out.push(name)
  }
  return out.length ? out : ['audit']
}

function buildTitle(f) {
  const dom = f.domain_label || f.domain || 'audit'
  let t = String(f.title || 'untitled finding').replace(/\s+/g, ' ').trim()
  const prefix = `[audit/${dom}] `
  const max = 250 - prefix.length
  if (t.length > max) t = `${t.slice(0, max - 1)}…`
  return prefix + t
}

function buildBody(f) {
  const loc = f.file ? `\`${f.file}\`${f.line ? `:${f.line}` : ''}` : '_unspecified_'
  const sev = (f.severity || 'medium').toLowerCase()
  const lowConf = f.confidence === 'low' || f.confidence === 'plausible'
  const lines = [
    `> Filed by the full-repo governance audit sweep (2026-08-05). Tracked via the \`audit\` label.`,
    ...(lowConf ? ['>', `> ⚠ **Lower confidence (${f.confidence})** — needs a repro / verification before acting; may depend on runtime behavior not confirmed by static reading.`] : []),
    '',
    `**Severity:** ${sev}  ·  **Category:** ${f.category || 'general'}  ·  **Domain:** ${f.domain || '—'}`,
    '',
    `**Location:** ${loc}`,
    '',
    '## What',
    '',
    f.summary || f.title || '',
    '',
    '## Evidence',
    '',
    '```',
    (f.evidence || '(see location)').toString().slice(0, 1500),
    '```',
    '',
    '## Why it matters / failure scenario',
    '',
    f.failure_scenario || '(not specified)',
  ]
  if (f.recommendation) {
    lines.push('', '## Suggested direction', '', f.recommendation)
  }
  lines.push('', '---', `<sub>audit-domain: ${f.domain || '—'} · confidence: ${f.confidence || 'n/a'}</sub>`)
  return lines.join('\n')
}

function looksRateLimited(msg) {
  return /rate limit|secondary rate|submitted too quickly|abuse|was submitted too fast|403/i.test(msg)
}

function looksTransient(msg) {
  return /\bEOF\b|connection reset|connection closed|broken pipe|client\.Timeout|i\/o timeout|\btimeout\b|tls handshake|temporarily|dial tcp|unexpected eof|network is unreachable|no such host|502|503|504|graphql/i.test(msg)
}

async function createIssue(title, body, labels) {
  const tmp = path.join(os.tmpdir(), `audit-issue-body.md`)
  fs.writeFileSync(tmp, body)
  const argv = ['issue', 'create', '--title', title, '--body-file', tmp]
  for (const l of labels) argv.push('--label', l)
  if (REPO) argv.push('--repo', REPO)
  let attempt = 0
  for (;;) {
    try {
      const out = execFileSync('gh', argv, { encoding: 'utf8' })
      const url = out.trim().split('\n').pop().trim()
      const number = Number((url.match(/\/issues\/(\d+)/) || [])[1] || 0)
      return { url, number }
    } catch (e) {
      const msg = `${e.stdout || ''}${e.stderr || ''}${e.message || ''}`
      attempt++
      const rl = looksRateLimited(msg)
      const net = !rl && looksTransient(msg)
      if ((rl || net) && attempt <= 8) {
        const wait = rl ? Math.min(120000, 15000 * attempt) : Math.min(15000, 2000 * attempt)
        console.error(`  … ${rl ? 'rate limited' : 'transient net error'} (attempt ${attempt}); retry in ${wait / 1000}s`)
        await sleep(wait)
        continue
      }
      throw new Error(msg.trim().split('\n').slice(-3).join(' | '))
    }
  }
}

async function main() {
  const findings = readJsonl(FINDINGS)
  const ledger = readJsonl(LEDGER)
  const done = new Set(ledger.map((e) => e.key))
  const known = DRY ? new Set() : existingLabels()
  const liveTitles = DRY ? new Set() : liveIssueTitles()

  // In-run dedup so two findings with the same key never both file.
  const queue = []
  const seen = new Set(done)
  for (const f of findings) {
    const key = keyOf(f)
    if (seen.has(key)) continue
    seen.add(key)
    queue.push({ f, key })
  }

  console.log(`findings=${findings.length} already-filed=${done.size} to-file=${queue.length} dry-run=${DRY} limit=${LIMIT === Infinity ? '∞' : LIMIT}`)
  let filed = 0
  let failed = 0
  for (const { f, key } of queue) {
    if (filed >= LIMIT) break
    const title = buildTitle(f)
    const labels = buildLabels(f, known)
    if (DRY) {
      console.log(`\n${'='.repeat(80)}\n[DRY] ${title}\n      labels: ${labels.join(', ')}`)
      if (args.includes('--show-body')) console.log(`------ body ------\n${buildBody(f)}\n------ /body ------`)
      filed++
      continue
    }
    if (liveTitles.has(title)) {
      fs.appendFileSync(LEDGER, `${JSON.stringify({ key, number: 0, url: 'preexisting', title, skipped: true })}\n`)
      console.log(`~ exists on GitHub, skip: ${title}`)
      continue
    }
    try {
      const { url, number } = await createIssue(title, buildBody(f), labels)
      fs.appendFileSync(LEDGER, `${JSON.stringify({ key, number, url, title })}\n`)
      filed++
      console.log(`#${number} ${title}`)
      await sleep(SLEEP)
    } catch (e) {
      failed++
      console.error(`  ✗ FAILED: ${title}\n    ${e.message}`)
      fs.appendFileSync(path.join(RESEARCH, 'file-errors.log'), `${JSON.stringify({ key, title, error: e.message })}\n`)
      await sleep(1000)
    }
  }
  console.log(`\nDONE. ${DRY ? 'would file' : 'filed'}=${filed} failed=${failed} remaining=${Math.max(0, queue.length - filed)}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
