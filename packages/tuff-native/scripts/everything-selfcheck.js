'use strict'

const path = require('node:path')

function parseArgs(argv) {
  const args = {
    query: 'test',
    maxResults: 20
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]

    if (token === '--') {
      continue
    }

    if (token === '--query' || token === '-q') {
      args.query = argv[i + 1] || args.query
      i += 1
      continue
    }

    if (token === '--max' || token === '-n') {
      const value = Number.parseInt(argv[i + 1] || '', 10)
      if (Number.isFinite(value) && value > 0) {
        args.maxResults = value
      }
      i += 1
      continue
    }
  }

  return args
}

function printSummary(summary) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (process.platform !== 'win32') {
    printSummary({
      ok: false,
      skipped: true,
      reason: 'windows-only',
      platform: process.platform,
      hint: 'Run this command on Windows to verify Everything SDK integration.'
    })
    process.exitCode = 0
    return
  }

  const modulePath = path.resolve(__dirname, '../everything.js')
  const everything = require(modulePath)

  const version = typeof everything.getVersion === 'function' ? everything.getVersion() : null

  try {
    const startedAt = Date.now()
    const results = await Promise.resolve(
      everything.search(options.query, {
        maxResults: options.maxResults
      })
    )
    const durationMs = Date.now() - startedAt

    const first = Array.isArray(results) && results.length > 0 ? results[0] : null

    printSummary({
      ok: true,
      platform: process.platform,
      version,
      query: options.query,
      maxResults: options.maxResults,
      durationMs,
      resultCount: Array.isArray(results) ? results.length : 0,
      sample: first
        ? {
            fullPath: first.fullPath || null,
            name: first.name || first.filename || null,
            size: typeof first.size === 'number' ? first.size : null,
            isFolder: typeof first.isFolder === 'boolean' ? first.isFolder : null
          }
        : null
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code = error && typeof error === 'object' ? error.code : undefined

    printSummary({
      ok: false,
      platform: process.platform,
      version,
      query: options.query,
      maxResults: options.maxResults,
      error: message,
      code: typeof code === 'string' ? code : null
    })
    process.exitCode = 1
  }
}

main()
