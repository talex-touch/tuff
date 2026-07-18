'use strict'

const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const MAX_SAMPLE_COUNT = 10_000

function parsePositiveInteger(
  value,
  fallback,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.min(parsed, maximum)
}

function parseArgs(argv) {
  const args = {
    query: 'test',
    maxResults: 20,
    sampleCount: 1,
    requireResults: false,
    outputPath: null,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--')
      continue

    if (token === '--query' || token === '-q') {
      args.query = argv[i + 1] || args.query
      i += 1
      continue
    }
    if (token === '--max' || token === '-n') {
      args.maxResults = parsePositiveInteger(argv[i + 1], args.maxResults)
      i += 1
      continue
    }
    if (token === '--samples') {
      args.sampleCount = parsePositiveInteger(
        argv[i + 1],
        args.sampleCount,
        MAX_SAMPLE_COUNT,
      )
      i += 1
      continue
    }
    if (token === '--require-results') {
      args.requireResults = true
      continue
    }
    if (token === '--output' && argv[i + 1]) {
      args.outputPath = path.resolve(argv[i + 1])
      i += 1
    }
  }

  return args
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0)
    return null
  const index = Math.max(
    0,
    Math.ceil(percentileValue * sortedValues.length) - 1,
  )
  return sortedValues[Math.min(index, sortedValues.length - 1)]
}

function summarizePerformance(durations) {
  const sorted = [...durations].sort((left, right) => left - right)
  const sampleCount = sorted.length
  return {
    sampleCount,
    durationSampleCount: sampleCount,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sampleCount > 0 ? sorted[sampleCount - 1] : null,
    successCount: sampleCount,
    timeoutCount: 0,
    errorCount: 0,
    abortedCount: 0,
    sdkCount: sampleCount,
    cliCount: 0,
    fallbackCount: 0,
    fallbackRatio: 0,
  }
}

function writeSummary(summary, outputPath) {
  const serialized = `${JSON.stringify(summary, null, 2)}\n`
  process.stdout.write(serialized)
  if (!outputPath)
    return
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, serialized, 'utf8')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (process.platform !== 'win32') {
    writeSummary(
      {
        schema: 'everything-native-selfcheck/v1',
        ok: false,
        skipped: true,
        reason: 'windows-only',
        platform: process.platform,
        hint: 'Run this command on Windows to verify Everything SDK integration.',
      },
      options.outputPath,
    )
    return
  }

  const modulePath = path.resolve(__dirname, '../everything.js')
  let everything = null
  let version = null
  const durations = []
  let lastResultCount = 0
  let nonEmptySampleCount = 0

  try {
    everything = require(modulePath)
    version
      = typeof everything.getVersion === 'function'
        ? everything.getVersion()
        : null
    for (let index = 0; index < options.sampleCount; index += 1) {
      const startedAt = Date.now()
      const results = await Promise.resolve(
        everything.search(options.query, {
          maxResults: options.maxResults,
        }),
      )
      durations.push(Date.now() - startedAt)
      lastResultCount = Array.isArray(results) ? results.length : 0
      if (lastResultCount > 0)
        nonEmptySampleCount += 1
    }

    if (options.requireResults && nonEmptySampleCount === 0) {
      const error = new Error(
        'Everything SDK self-check returned no results for every sample',
      )
      error.code = 'ERR_EVERYTHING_EMPTY_SELF_CHECK'
      throw error
    }

    writeSummary(
      {
        schema: 'everything-native-selfcheck/v1',
        ok: true,
        backend: 'sdk-napi',
        platform: process.platform,
        version,
        maxResults: options.maxResults,
        resultCount: lastResultCount,
        nonEmptySampleCount,
        queryIncluded: false,
        resultPathsIncluded: false,
        performance: summarizePerformance(durations),
        errorCode: null,
        backendErrorCode: null,
      },
      options.outputPath,
    )
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code = error && typeof error === 'object' ? error.code : undefined
    const backendErrorMatch = /Everything query failed, error code: (\d+)/.exec(
      message,
    )
    writeSummary(
      {
        schema: 'everything-native-selfcheck/v1',
        ok: false,
        backend: 'sdk-napi',
        platform: process.platform,
        version,
        resultCount: 0,
        nonEmptySampleCount,
        queryIncluded: false,
        resultPathsIncluded: false,
        performance: { ...summarizePerformance(durations), errorCount: 1 },
        error: message,
        errorCode: typeof code === 'string' ? code : null,
        backendErrorCode: backendErrorMatch
          ? Number.parseInt(backendErrorMatch[1], 10)
          : null,
      },
      options.outputPath,
    )
    process.exitCode = 1
  }
}

module.exports = {
  MAX_SAMPLE_COUNT,
  parseArgs,
  percentile,
  summarizePerformance,
  writeSummary,
}

if (require.main === module) {
  void main()
}
