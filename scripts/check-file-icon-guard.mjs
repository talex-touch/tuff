#!/usr/bin/env node
/**
 * Keeps the macOS `app.getFileIcon` crash from coming back by a side door.
 *
 * On darwin, `app.getFileIcon(path, { size: 'large' })` is the unsupported path that produced the
 * SIGTRAP / EXC_BREAKPOINT reports behind the App Icon self-healing work (#310). The fix is
 * `canUseElectronFileIcon`, which refuses that combination and returns null instead of calling
 * Electron.
 *
 * A wrapper only protects the callers that use it. Today every caller does -- `app.getFileIcon`
 * appears exactly once in 2,336 source files, inside the wrapper -- but nothing says it has to
 * stay that way. Someone can `import { app } from 'electron'` and call it directly, and the only
 * thing that notices is a crash report from a user on a Mac.
 *
 * #310's third acceptance criterion is "no unsupported Electron `large` icon path occurs". That
 * was verified once, by hand, on a real machine. This makes it a fact about the tree instead.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WRAPPER = 'apps/core-app/src/main/utils/electron-file-icon.ts'
const ROOTS = ['apps/core-app/src', 'packages']
const SKIP = new Set(['node_modules', 'dist', 'out', 'build', '.output', 'target', '.nuxt'])

export function findSources(roots = ROOTS, root = repoRoot) {
  const files = []
  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    }
    catch {
      return
    }
    for (const entry of entries) {
      if (SKIP.has(entry.name))
        continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory())
        walk(full)
      else if (/\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name) && !/\.test\./.test(entry.name))
        files.push(path.relative(root, full))
    }
  }
  for (const dir of roots) walk(path.join(root, dir))
  return files.sort()
}

/**
 * Every direct `app.getFileIcon` call outside the wrapper.
 *
 * Matched on `.getFileIcon(` rather than `app.getFileIcon(` so that an aliased import
 * (`import { app as electronApp }`) is caught too -- the alias is the obvious way this rule gets
 * worked around without meaning to.
 */
export function findDirectCalls(fileContents, wrapper = WRAPPER) {
  const offenders = []
  for (const [file, text] of Object.entries(fileContents)) {
    if (file === wrapper)
      continue
    if (/\.getFileIcon\s*\(/.test(text))
      offenders.push(file)
  }
  return offenders
}

/** The wrapper must still refuse darwin + `large`; a "simplified" wrapper is the other way back. */
export function wrapperStillGuards(text) {
  if (typeof text !== 'string')
    return false
  const mentionsDarwin = /'darwin'|"darwin"/.test(text)
  const mentionsLarge = /'large'|"large"/.test(text)
  const shortCircuits = /return null|=== false|!canUseElectronFileIcon/.test(text)
  return mentionsDarwin && mentionsLarge && shortCircuits
}

/** Discovery returning nothing is not a pass — same rule, same reason, as validate-plugins.mjs. */
export function discoveryFoundNothing(files) {
  return !Array.isArray(files) || files.length === 0
}

function selfTest() {
  const guarded = `
    export function canUseElectronFileIcon(options) {
      return process.platform !== 'darwin' || options?.size !== 'large'
    }
    export async function getElectronFileIcon(filePath, options) {
      if (!canUseElectronFileIcon(options)) return null
      return app.getFileIcon(filePath, options)
    }
  `
  const cases = [
    {
      name: 'a direct call outside the wrapper is caught',
      actual: findDirectCalls({ 'a/b.ts': 'await app.getFileIcon(p, { size: "large" })' }).length,
      expected: 1,
    },
    {
      name: 'an aliased import is caught too',
      actual: findDirectCalls({ 'a/b.ts': 'await electronApp.getFileIcon(p)' }).length,
      expected: 1,
    },
    {
      name: 'the wrapper itself is not its own offender',
      actual: findDirectCalls({ [WRAPPER]: 'return app.getFileIcon(filePath, options)' }).length,
      expected: 0,
    },
    {
      name: 'a file that does not touch the API is left alone',
      actual: findDirectCalls({ 'a/b.ts': 'const icon = await iconService.extractFileIcon(p)' }).length,
      expected: 0,
    },
    {
      name: 'the real wrapper reads as guarded',
      actual: wrapperStillGuards(guarded),
      expected: true,
    },
    {
      name: 'a wrapper that dropped the darwin check fails',
      actual: wrapperStillGuards(`
        export async function getElectronFileIcon(filePath, options) {
          return app.getFileIcon(filePath, options)
        }
      `),
      expected: false,
    },
    {
      name: 'a wrapper that kept the check but stopped short-circuiting fails',
      actual: wrapperStillGuards(`
        const ok = process.platform !== 'darwin' || options?.size !== 'large'
        return app.getFileIcon(filePath, options)
      `),
      expected: false,
    },
    {
      name: 'empty discovery is a failure, not a clean sweep',
      actual: discoveryFoundNothing([]),
      expected: true,
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

const files = findSources()

if (discoveryFoundNothing(files)) {
  console.error('\x1B[31mNo source files found — this check would report success without reading anything.\x1B[0m\n')
  process.exit(1)
}

const contents = Object.fromEntries(
  files.map(file => [file, fs.readFileSync(path.join(repoRoot, file), 'utf8')]),
)

const problems = []

const offenders = findDirectCalls(contents)
for (const offender of offenders)
  problems.push(`${offender} calls getFileIcon directly; go through ${WRAPPER}`)

const wrapperText = contents[WRAPPER]
if (typeof wrapperText !== 'string')
  problems.push(`${WRAPPER} is missing — the darwin large-icon guard lives there`)
else if (!wrapperStillGuards(wrapperText))
  problems.push(`${WRAPPER} no longer refuses darwin + size 'large'`)

console.log(`\nChecked ${files.length} source files for the macOS file-icon guard.\n`)

if (problems.length > 0) {
  for (const problem of problems) console.error(`\x1B[31m  ✗\x1B[0m ${problem}`)
  console.error(`\n\x1B[31m${problems.length} problem(s). See #310.\x1B[0m\n`)
  process.exit(1)
}

console.log('\x1B[32mgetFileIcon is reached only through the guard, and the guard still refuses darwin + large.\x1B[0m\n')
