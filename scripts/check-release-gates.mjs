import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { runLocalReleaseGateChecks } from './check-release-gates/local-checks.mjs'
import { checkRemoteRelease } from './check-release-gates/remote-checks.mjs'
import { getArgValue, hasFlag, toBool } from './lib/argv-utils.mjs'
import { normalizeBaseUrl } from './lib/http-utils.mjs'

const repoRoot = process.cwd()
const argv = process.argv

/**
 * The shipped product's own version, so `--tag` has a default that cannot go stale. It used
 * to be the literal `v2.4.7`, which meant a run without `--tag` silently gated a release
 * seven versions old and reported its verdict as if it were about the current one (#557).
 */
export function defaultTagFrom(root = repoRoot) {
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'apps', 'core-app', 'package.json'), 'utf8'),
  )
  return `v${manifest.version}`
}

const tag = getArgValue(argv, '--tag', defaultTagFrom())
const version = getArgValue(argv, '--version', tag.replace(/^v/, ''))
const stage = String(getArgValue(argv, '--stage', 'gate-d'))
  .trim()
  .toLowerCase()

/**
 * A release gate that reports `"result": "fail"` and exits 0 is not a gate (#558). Failure is
 * fatal by default now; `--report-only` restores the survey behaviour for the case this was
 * presumably written for — inspecting the JSON without the process dying. `--strict` stays
 * accepted so existing invocations keep working, but it no longer decides anything.
 */
const reportOnly = toBool(getArgValue(argv, '--report-only', hasFlag(argv, '--report-only')))
const strict = !reportOnly
const manifestArg = getArgValue(argv, '--manifest')
const baseUrlArg = getArgValue(argv, '--base-url')
const timeoutMs = Number(getArgValue(argv, '--timeout-ms', '20000')) || 20000

const checks = []

function pushCheck(name, status, detail, meta = {}) {
  checks.push({ name, status, detail, ...meta })
}

async function main() {
  runLocalReleaseGateChecks({
    repoRoot,
    version,
    stage,
    manifestArg,
    pushCheck,
  })

  if (baseUrlArg) {
    await checkRemoteRelease({
      baseUrlValue: baseUrlArg,
      tag,
      stage,
      timeoutMs,
      pushCheck,
    })
  }

  const failedChecks = checks.filter(item => item.status === 'fail')
  const blockedChecks = checks.filter(item => item.status === 'blocked')
  const result
    = failedChecks.length > 0
      ? 'fail'
      : blockedChecks.length > 0
        ? 'blocked'
        : 'pass'

  const summary = {
    tag,
    version,
    stage,
    strict,
    reportOnly,
    baseUrl: baseUrlArg ? normalizeBaseUrl(baseUrlArg) : null,
    result,
    checks,
  }

  console.log(JSON.stringify(summary, null, 2))

  // Anything short of `pass` is fatal unless the caller explicitly asked for a survey.
  if (!reportOnly && result !== 'pass') {
    process.exit(1)
  }
}

await main()
