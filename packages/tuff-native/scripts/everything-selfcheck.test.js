const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  MAX_SAMPLE_COUNT,
  parseArgs,
  percentile,
  summarizePerformance,
} = require('./everything-selfcheck.js')

const packageRoot = path.resolve(__dirname, '..')

test('caps sample requests and parses output and require-results options', () => {
  const outputPath = 'self-check/evidence.json'
  const options = parseArgs([
    '--samples',
    String(MAX_SAMPLE_COUNT + 1),
    '--require-results',
    '--output',
    outputPath,
  ])

  assert.equal(options.sampleCount, MAX_SAMPLE_COUNT)
  assert.equal(options.requireResults, true)
  assert.equal(options.outputPath, path.resolve(outputPath))
})

test('calculates nearest-rank percentiles and handles empty samples', () => {
  const samples = Array.from({ length: 20 }, (_, index) => index + 1)

  assert.equal(percentile([], 0.5), null)
  assert.equal(percentile(samples, 0.5), 10)
  assert.equal(percentile(samples, 0.95), 19)
})

test('summarizes sorted performance metrics with consistent sample counts', () => {
  const summary = summarizePerformance([8, 1, 5, 3])

  assert.equal(summary.sampleCount, 4)
  assert.equal(summary.durationSampleCount, summary.sampleCount)
  assert.equal(summary.successCount, summary.sampleCount)
  assert.equal(summary.sdkCount, summary.sampleCount)
  assert.deepEqual([summary.p50Ms, summary.p95Ms, summary.maxMs], [3, 8, 8])
})

test('writes redacted self-check evidence without query or result paths', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'everything-selfcheck-test-'),
  )
  const outputPath = path.join(directory, 'nested', 'evidence.json')
  const preloadPath = path.join(directory, 'fake-everything.js')
  const secretQuery = 'private-query-5f16d8'
  const secretResultPath = 'C:\\Users\\Private\\sensitive-result.txt'
  const addonPath = path.join(packageRoot, 'everything.js')

  fs.writeFileSync(
    preloadPath,
    `const Module = require('node:module')
const originalLoad = Module._load
const addonPath = ${JSON.stringify(addonPath)}
Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
Module._load = function (request, parent, isMain) {
  if (request === addonPath) {
    return {
      getVersion: () => '1.2.3',
      search: () => [${JSON.stringify(secretResultPath)}]
    }
  }
  return originalLoad.apply(this, arguments)
}
`,
    'utf8',
  )

  try {
    const stdout = execFileSync(
      process.execPath,
      [
        '--require',
        preloadPath,
        'scripts/everything-selfcheck.js',
        '--query',
        secretQuery,
        '--samples',
        '2',
        '--require-results',
        '--output',
        outputPath,
      ],
      { cwd: packageRoot, encoding: 'utf8' },
    )
    const evidence = JSON.parse(fs.readFileSync(outputPath, 'utf8'))

    assert.deepEqual(JSON.parse(stdout), evidence)
    assert.equal(evidence.ok, true)
    assert.equal(evidence.queryIncluded, false)
    assert.equal(evidence.resultPathsIncluded, false)
    assert.equal(Object.hasOwn(evidence, 'query'), false)
    assert.equal(Object.hasOwn(evidence, 'resultPaths'), false)
    assert.equal(evidence.performance.sampleCount, 2)
    assert.doesNotMatch(
      JSON.stringify(evidence),
      new RegExp(`${secretQuery}|${secretResultPath.replace(/\\/g, '\\\\')}`),
    )
  }
  finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('reports query failure codes without exposing private query paths', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'everything-selfcheck-test-'),
  )
  const preloadPath = path.join(directory, 'failing-everything.js')
  const privateQueryPath = 'C:\\Users\\Private\\query.txt'
  const addonPath = path.join(packageRoot, 'everything.js')

  fs.writeFileSync(
    preloadPath,
    `const Module = require('node:module')
const originalLoad = Module._load
const addonPath = ${JSON.stringify(addonPath)}
const failure = new Error('Everything query failed, error code: 2')
failure.code = 'ERR_EVERYTHING_QUERY_FAILED'
Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
Module._load = function (request, parent, isMain) {
  if (request === addonPath) {
    return {
      getVersion: () => '1.2.3',
      search: () => { throw failure }
    }
  }
  return originalLoad.apply(this, arguments)
}
`,
    'utf8',
  )

  try {
    const result = spawnSync(
      process.execPath,
      [
        '--require',
        preloadPath,
        'scripts/everything-selfcheck.js',
        '--query',
        privateQueryPath,
      ],
      { cwd: packageRoot, encoding: 'utf8' },
    )
    const evidence = JSON.parse(result.stdout)

    assert.equal(evidence.ok, false)
    assert.equal(evidence.errorCode, 'ERR_EVERYTHING_QUERY_FAILED')
    assert.equal(evidence.backendErrorCode, 2)
    assert.match(evidence.error, /Everything query failed, error code: 2$/)
    assert.equal(evidence.queryIncluded, false)
    assert.equal(evidence.resultPathsIncluded, false)
    assert.equal(Object.hasOwn(evidence, 'query'), false)
    assert.equal(Object.hasOwn(evidence, 'resultPaths'), false)
    assert.equal(JSON.stringify(evidence).includes(privateQueryPath), false)
  }
  finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
