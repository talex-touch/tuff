#!/usr/bin/env node
/**
 * Fails on a Critical/High production advisory that nobody has signed off on.
 *
 * The repo had no production dependency gate at all. `pnpm audit --prod` was in #328's
 * Verification block and in #325's acceptance criteria, but nothing ran it, so the advisory count
 * moved -- 28 down to 19, and a `sharp` High that turned out to be `astro` filed under
 * `dependencies` -- entirely unobserved by CI.
 *
 * A plain `pnpm audit --prod --audit-level high` cannot be that gate: it is red on arrival, so it
 * would be merged as `continue-on-error` within a day and join the list of controls that report
 * success no matter what. This ratchets instead. Everything Critical/High that exists today is
 * written down with a reason, an owner link, and an expiry; anything not on that list fails.
 *
 * Three ways to fail, and the third is the one that keeps the list honest:
 *   1. an advisory that is not on the list         -- the point of the gate
 *   2. a list entry past its expiry                -- an exception is a deadline, not a waiver
 *   3. a list entry whose advisory is gone         -- otherwise the list only ever grows, and a
 *                                                     stale entry silently pre-approves a future
 *                                                     re-introduction of the same advisory
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const allowlistPath = path.join(repoRoot, '.github', 'prod-audit-allowlist.json')
const BLOCKING = new Set(['critical', 'high'])

/**
 * Reads the audit JSON into `{ id -> {module, severity} }` for the severities that block.
 *
 * Throws rather than returning empty when the payload has no advisory container at all. An audit
 * that failed to reach the registry and an audit that found nothing produce the same empty map,
 * and the second is the answer this gate exists to distrust -- see #1586, same failure shape.
 */
export function collectBlockingAdvisories(payload) {
  if (!payload || typeof payload !== 'object')
    throw new Error('audit produced no JSON object')
  if (!('advisories' in payload) && !('metadata' in payload))
    throw new Error('audit JSON has neither advisories nor metadata — treating as a failed run')

  const advisories = payload.advisories ?? {}
  const found = new Map()
  for (const advisory of Object.values(advisories)) {
    const severity = String(advisory?.severity ?? '').toLowerCase()
    if (!BLOCKING.has(severity))
      continue
    const id = advisory?.github_advisory_id ?? String(advisory?.id ?? '')
    if (!id)
      continue
    found.set(id, { module: advisory?.module_name ?? 'unknown', severity })
  }
  return found
}

/** Compares the audit against the allowlist and returns every reason this run should fail. */
export function evaluate(found, allowlist, today) {
  const problems = []
  const entries = Array.isArray(allowlist?.advisories) ? allowlist.advisories : []
  const byId = new Map(entries.map(entry => [entry.id, entry]))

  for (const [id, info] of found) {
    if (!byId.has(id))
      problems.push(`unapproved ${info.severity.toUpperCase()} advisory ${id} (${info.module})`)
  }

  for (const entry of entries) {
    if (!entry?.id) {
      problems.push('allowlist entry without an id')
      continue
    }
    if (!entry.reason || !entry.owner || !entry.expires)
      problems.push(`allowlist entry ${entry.id} needs reason, owner and expires`)
    else if (entry.expires < today)
      problems.push(`allowlist entry ${entry.id} expired on ${entry.expires}`)
    if (!found.has(entry.id))
      problems.push(`allowlist entry ${entry.id} no longer matches a live advisory — remove it`)
  }

  return problems
}

function selfTest() {
  const today = '2026-08-11'
  const live = new Map([['GHSA-aaaa', { module: 'left', severity: 'high' }]])
  const good = { advisories: [{ id: 'GHSA-aaaa', reason: 'r', owner: '#328', expires: '2026-11-09' }] }

  const cases = [
    {
      name: 'a matching, unexpired allowlist entry passes',
      actual: evaluate(live, good, today).length,
      expected: 0,
    },
    {
      name: 'an advisory absent from the allowlist fails',
      actual: evaluate(live, { advisories: [] }, today).length > 0,
      expected: true,
    },
    {
      name: 'an expired allowlist entry fails even though the advisory is listed',
      actual: evaluate(live, { advisories: [{ ...good.advisories[0], expires: '2026-08-10' }] }, today).length > 0,
      expected: true,
    },
    {
      name: 'an allowlist entry with no live advisory fails, so the list cannot only grow',
      actual: evaluate(new Map(), good, today).length > 0,
      expected: true,
    },
    {
      name: 'an allowlist entry missing owner/reason/expiry fails',
      actual: evaluate(live, { advisories: [{ id: 'GHSA-aaaa' }] }, today).length > 0,
      expected: true,
    },
    {
      name: 'moderate and low advisories do not block',
      actual: collectBlockingAdvisories({
        advisories: { a: { severity: 'moderate', github_advisory_id: 'GHSA-m', module_name: 'm' } },
      }).size,
      expected: 0,
    },
    {
      name: 'critical and high are collected',
      actual: collectBlockingAdvisories({
        advisories: {
          a: { severity: 'critical', github_advisory_id: 'GHSA-c', module_name: 'c' },
          b: { severity: 'high', github_advisory_id: 'GHSA-h', module_name: 'h' },
        },
      }).size,
      expected: 2,
    },
    {
      name: 'an audit that produced nothing at all throws instead of reporting clean',
      actual: (() => {
        try {
          collectBlockingAdvisories({})
          return false
        }
        catch {
          return true
        }
      })(),
      expected: true,
    },
    {
      name: 'a real audit shape with zero advisories is a clean pass, not a throw',
      actual: collectBlockingAdvisories({ advisories: {}, metadata: { vulnerabilities: {} } }).size,
      expected: 0,
    },
  ]

  let failures = 0
  for (const testCase of cases) {
    const ok = testCase.actual === testCase.expected
    if (!ok)
      failures += 1
    console.log(`${ok ? '\x1B[32m  ok\x1B[0m' : '\x1B[31mFAIL\x1B[0m'}  ${testCase.name}`)
  }
  console.log(
    failures === 0
      ? `\n\x1B[32mSelf-test passed: ${cases.length} cases.\x1B[0m\n`
      : `\n\x1B[31mSelf-test failed: ${failures}/${cases.length} cases.\x1B[0m\n`,
  )
  return failures
}

if (process.argv.includes('--self-test'))
  process.exit(selfTest() > 0 ? 1 : 0)

// pnpm audit exits non-zero whenever it finds anything, so the exit code says nothing about
// whether the run succeeded. The JSON shape is the signal, and collectBlockingAdvisories throws
// when it is missing.
const run = spawnSync('pnpm', ['audit', '--prod', '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})

let payload
try {
  payload = JSON.parse(run.stdout ?? '')
}
catch {
  console.error('\x1B[31mCould not parse `pnpm audit --prod --json` output.\x1B[0m')
  console.error((run.stderr || run.stdout || '').split('\n').slice(-15).join('\n'))
  process.exit(1)
}

let found
try {
  found = collectBlockingAdvisories(payload)
}
catch (error) {
  console.error(`\x1B[31m${error.message}\x1B[0m`)
  process.exit(1)
}

const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'))
const today = new Date().toISOString().slice(0, 10)
const problems = evaluate(found, allowlist, today)

const totals = payload.metadata?.vulnerabilities ?? {}
console.log(
  `\nProduction audit: ${found.size} Critical/High advisories, ${allowlist.advisories.length} allowlisted.`,
)
console.log(`All severities: ${JSON.stringify(totals)}\n`)

if (problems.length > 0) {
  for (const problem of problems) console.error(`\x1B[31m  ✗\x1B[0m ${problem}`)
  console.error(`\n\x1B[31m${problems.length} production audit problem(s). See ${path.relative(repoRoot, allowlistPath)}.\x1B[0m\n`)
  process.exit(1)
}

console.log('\x1B[32mNo unapproved Critical/High production advisories.\x1B[0m\n')
