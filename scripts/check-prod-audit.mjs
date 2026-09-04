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
 * Reads the audit JSON into `{ id -> {module, severity, versions} }` for the severities that block.
 *
 * `versions` is what the advisory actually hits in this tree, from its own findings. It is here so
 * the allowlist can be checked against it rather than against prose -- see `evaluate`.
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
    const versions = [
      ...new Set(
        (Array.isArray(advisory?.findings) ? advisory.findings : [])
          .map(finding => String(finding?.version ?? ''))
          .filter(Boolean),
      ),
    ].sort()
    found.set(id, { module: advisory?.module_name ?? 'unknown', severity, versions })
  }
  return found
}

/** How many times an audit that produced no verdict is worth re-running before giving up. */
const AUDIT_ATTEMPTS = 3

/**
 * Runs the audit until it yields an evaluable payload, or gives up after `maxAttempts`.
 *
 * A single attempt is not enough to trust. An audit that could not reach the registry and an audit
 * that found nothing look identical downstream -- that is the failure `collectBlockingAdvisories`
 * exists to distrust (#1586). Before this, one transient registry hiccup failed the whole build.
 *
 * Both failure shapes retry, because they are one event seen at two depths: the audit produced no
 * verdict. Unparseable stdout is that event caught by `JSON.parse`; a payload with neither
 * `advisories` nor `metadata` is the same event caught one level in, once the truncated or error
 * output happened to still be valid JSON.
 *
 * There is deliberately no sleep between attempts. `pnpm audit` is a full registry round trip and
 * takes seconds on its own, so the attempts are already spaced by the thing being retried; adding
 * a delay to a synchronous script would mean `Atomics.wait`, and would slow the self-test to no
 * purpose since it passes a runner that does no I/O at all.
 *
 * @param {() => string} runAudit Produces raw audit stdout. Called once per attempt.
 * @param {number} maxAttempts
 * @returns {{ attempts: number, payload: object, found: Map<string, object> }} The parsed audit,
 * the advisories that block, and how many attempts it took to get them.
 * @throws When every attempt failed. The message carries the last failure's reason.
 */
export function runAuditWithRetry(runAudit, maxAttempts = AUDIT_ATTEMPTS) {
  let lastReason = 'no attempts were made'

  for (let attempts = 1; attempts <= maxAttempts; attempts += 1) {
    let payload
    try {
      payload = JSON.parse(runAudit() ?? '')
    }
    catch (error) {
      lastReason = `audit output was not JSON (${error.message})`
      continue
    }

    /*
     * pnpm reports a failed audit as a well-formed JSON body -- `{"error":{"code":"pnpm",
     * "message":"fetch failed"}}` -- with nothing else to distinguish it: the output parses, and
     * the exit code is already meaningless here. Catching it by shape keeps the real reason in the
     * final message instead of the generic "neither advisories nor metadata" that
     * collectBlockingAdvisories would raise one line later about the same payload.
     */
    if (payload?.error) {
      lastReason = `pnpm audit failed: ${payload.error.message ?? JSON.stringify(payload.error)}`
      continue
    }

    try {
      return { attempts, payload, found: collectBlockingAdvisories(payload) }
    }
    catch (error) {
      lastReason = error.message
    }
  }

  throw new Error(
    `audit produced no evaluable result in ${maxAttempts} attempt(s); last failure: ${lastReason}`,
  )
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
    const live = found.get(entry.id)
    if (!live) {
      problems.push(`allowlist entry ${entry.id} no longer matches a live advisory — remove it`)
      continue
    }

    /*
     * The declared package and versions are checked against what the audit reports (#328).
     *
     * Every other field can be right while the entry describes a different dependency entirely.
     * That happened four times to one package here: #1691 attributed nanoid to a vue-router root,
     * #1708 to postcss, and the corrected text was then pasted onto GHSA-2v37-7h3g-55p8, whose
     * range is < 3.3.17 and whose only finding was the 3.3.16 that the pasted text called "already
     * on the patched line and not covered". A reviewer cannot catch that by reading -- it reads
     * perfectly, and it is about a package the sentence never names. The audit knows.
     */
    if (!Array.isArray(entry.versions) || entry.versions.length === 0) {
      problems.push(
        `allowlist entry ${entry.id} needs versions — the installed version(s) the advisory hits, `
        + `which the audit reports as ${live.versions?.join(', ') || '(none)'}`,
      )
      continue
    }
    if (entry.module !== live.module) {
      problems.push(
        `allowlist entry ${entry.id} says module ${entry.module}, audit reports ${live.module}`,
      )
    }
    if (entry.severity !== live.severity) {
      problems.push(
        `allowlist entry ${entry.id} says severity ${entry.severity}, audit reports ${live.severity}`,
      )
    }
    const declared = [...entry.versions].sort().join(', ')
    const actual = [...(live.versions ?? [])].sort().join(', ')
    if (declared !== actual) {
      problems.push(
        `allowlist entry ${entry.id} says version(s) ${declared}, audit reports ${actual || '(none)'}`,
      )
    }
  }

  return problems
}

function selfTest() {
  const today = '2026-08-11'
  const live = new Map([
    ['GHSA-aaaa', { module: 'left', severity: 'high', versions: ['1.2.3'] }],
  ])
  const entry = {
    id: 'GHSA-aaaa',
    module: 'left',
    severity: 'high',
    versions: ['1.2.3'],
    reason: 'r',
    owner: '#328',
    expires: '2026-11-09',
  }
  const good = { advisories: [entry] }
  /** The same entry with one field changed, which is how every real mistake here has looked. */
  const withOnly = patch => ({ advisories: [{ ...entry, ...patch }] })

  const retryPayload = {
    advisories: {
      retry: {
        severity: 'high',
        github_advisory_id: 'GHSA-retry',
        module_name: 'retry-package',
        findings: [{ version: '1.0.0' }],
      },
    },
  }
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
    /*
     * The four checks below are the ones #328's nanoid entry needed and did not have. Its id,
     * reason, owner and expiry were all fine; the sentence described a different package's
     * advisory range, and nothing could see that.
     */
    {
      name: 'an entry naming the wrong package fails',
      actual: evaluate(live, withOnly({ module: 'right' }), today)[0],
      expected: 'allowlist entry GHSA-aaaa says module right, audit reports left',
    },
    {
      name: 'an entry naming a version the advisory does not hit fails',
      actual: evaluate(live, withOnly({ versions: ['9.9.9'] }), today)[0],
      expected: 'allowlist entry GHSA-aaaa says version(s) 9.9.9, audit reports 1.2.3',
    },
    {
      name: 'an entry claiming a lower severity than the audit fails',
      actual: evaluate(live, withOnly({ severity: 'moderate' }), today)[0],
      expected: 'allowlist entry GHSA-aaaa says severity moderate, audit reports high',
    },
    {
      name: 'an entry with no versions at all fails rather than being taken on trust',
      actual: evaluate(live, withOnly({ versions: undefined }), today).length,
      expected: 1,
    },
    {
      name: 'version order does not matter, only the set',
      actual: evaluate(
        new Map([['GHSA-aaaa', { module: 'left', severity: 'high', versions: ['2.0.0', '1.2.3'] }]]),
        withOnly({ versions: ['1.2.3', '2.0.0'] }),
        today,
      ).length,
      expected: 0,
    },
    {
      name: 'the findings a real audit reports become versions',
      actual: collectBlockingAdvisories({
        advisories: {
          a: {
            severity: 'high',
            github_advisory_id: 'GHSA-v',
            module_name: 'v',
            findings: [{ version: '1.0.0' }, { version: '1.0.0' }, { version: '2.0.0' }],
          },
        },
      }).get('GHSA-v').versions.join(','),
      expected: '1.0.0,2.0.0',
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
      name: 'malformed and incomplete audit attempts retry until a later valid payload is evaluated',
      actual: (() => {
        const responses = ['{', '{}', JSON.stringify(retryPayload)]
        let invocations = 0
        const result = runAuditWithRetry(() => {
          invocations += 1
          return responses.shift()
        }, 3)
        return `${invocations}:${result.attempts}:${result.payload.advisories.retry.github_advisory_id}:${result.found.get('GHSA-retry')?.module}`
      })(),
      expected: '3:3:GHSA-retry:retry-package',
    },
    {
      name: 'exhausted incomplete audit attempts fail after the configured bound',
      actual: (() => {
        let invocations = 0
        let outcome = 'returned'
        try {
          runAuditWithRetry(() => {
            invocations += 1
            return '{}'
          }, 2)
        }
        catch {
          outcome = 'threw'
        }
        return `${outcome}:${invocations}`
      })(),
      expected: 'threw:2',
    },
    {
      name: 'a transient pnpm error payload is retried past rather than evaluated',
      actual: (() => {
        const responses = [
          JSON.stringify({ error: { code: 'pnpm', message: 'fetch failed' } }),
          JSON.stringify(retryPayload),
        ]
        const result = runAuditWithRetry(() => responses.shift(), 2)
        return `${result.attempts}:${result.found.get('GHSA-retry')?.module}`
      })(),
      expected: '2:retry-package',
    },
    {
      name: 'the pnpm error reason survives into the message when every attempt fails',
      actual: (() => {
        let reason = 'did not throw'
        try {
          runAuditWithRetry(
            () => JSON.stringify({ error: { code: 'pnpm', message: 'fetch failed' } }),
            2,
          )
        }
        catch (error) {
          reason = error.message
        }
        return reason.includes('fetch failed')
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
// whether the run succeeded. The JSON shape is the signal, and runAuditWithRetry throws once
// repeated attempts have all failed to produce one.
let lastRun
let audit
try {
  audit = runAuditWithRetry(() => {
    // Captured so the failure path below can still show what pnpm actually said. Only the last
    // attempt's output is kept: earlier attempts failed for the same reason or a staler one.
    lastRun = spawnSync('pnpm', ['audit', '--prod', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    return lastRun.stdout ?? ''
  })
}
catch (error) {
  console.error(`\x1B[31m${error.message}\x1B[0m`)
  console.error((lastRun?.stderr || lastRun?.stdout || '').split('\n').slice(-15).join('\n'))
  process.exit(1)
}

const { payload, found } = audit
if (audit.attempts > 1)
  console.log(`\x1B[33mAudit needed ${audit.attempts} attempts to return a usable result.\x1B[0m`)

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
