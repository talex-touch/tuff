import process from 'node:process'
import { getArgValue, hasFlag, toBool } from './lib/argv-utils.mjs'
import { normalizeBaseUrl } from './lib/http-utils.mjs'
import { runLocalReleaseGateChecks } from './check-release-gates/local-checks.mjs'
import { checkRemoteRelease } from './check-release-gates/remote-checks.mjs'

const repoRoot = process.cwd()
const argv = process.argv
const tag = getArgValue(argv, '--tag', 'v2.4.7')
const version = getArgValue(argv, '--version', tag.replace(/^v/, ''))
const stage = String(getArgValue(argv, '--stage', 'gate-d')).trim().toLowerCase()
const strict = toBool(getArgValue(argv, '--strict', hasFlag(argv, '--strict')))
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
  const result = failedChecks.length > 0 ? 'fail' : 'pass'

  const summary = {
    tag,
    version,
    stage,
    strict,
    baseUrl: baseUrlArg ? normalizeBaseUrl(baseUrlArg) : null,
    result,
    checks
  }

  console.log(JSON.stringify(summary, null, 2))

  if (strict && result === 'fail') {
    process.exit(1)
  }
}

await main()
