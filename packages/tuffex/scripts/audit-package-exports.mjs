import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')
const componentSrcRoot = resolve(root, 'packages/components/src')
// Declared here rather than beside its use: declarationProblems runs from --self-test, which
// exits before the filesystem work, so a const declared further down is still in its TDZ.
const outsideUtilsPattern = /['"](?:\.\.\/)+utils(?:\/[\w.-]+)*['"]/
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf-8'))

async function exists(relativePath) {
  try {
    await access(resolve(root, relativePath))
    return true
  }
  catch {
    return false
  }
}

async function assertExists(relativePath, errors) {
  if (!(await exists(relativePath))) {
    errors.push(relativePath)
  }
}

async function collectFiles(dir, predicate) {
  const dirents = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    dirents.map(async (dirent) => {
      const filePath = resolve(dir, dirent.name)
      if (dirent.isDirectory())
        return collectFiles(filePath, predicate)
      return predicate(filePath) ? [filePath] : []
    })
  )
  return files.flat()
}

async function collectComponentSubpaths() {
  const dirents = await readdir(componentSrcRoot, { withFileTypes: true })
  return publishableSubpaths(dirents)
}

/**
 * Which directories under components/src are publishable subpaths.
 *
 * Pulled out so `--self-test` can pin it: this filter decides what the whole per-component
 * existence sweep below even looks at, so a filter that quietly excludes too much reports a clean
 * audit over a shrinking set -- indistinguishable from an audit that found nothing wrong (#1589).
 */
export function publishableSubpaths(dirents) {
  return dirents
    // Every directory under components/src is treated as a publishable component
    // subpath, so anything that is not one has to be excluded here. 'utils' is shared
    // code; '__tests__' arrived with 14274af8b and is a test directory, which the build
    // correctly does not emit a bundle for -- leaving the audit to report
    // dist/es/__tests__/index.js as a *missing export* rather than as something that
    // should never have been expected.
    .filter(dirent => dirent.isDirectory() && dirent.name !== 'utils' && !/^__.*__$/.test(dirent.name))
    .map(dirent => dirent.name)
    .sort()
}

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

const errors = []

await assertExists(pkg.exports['.'].types, errors)
await assertExists(pkg.exports['.'].import, errors)
await assertExists(pkg.exports['.'].require, errors)
await assertExists(pkg.exports['./style.css'], errors)
await assertExists(pkg.exports['./base.css'], errors)
await assertExists(pkg.exports['./utils'].types, errors)
await assertExists(pkg.exports['./utils'].import, errors)
await assertExists(pkg.exports['./utils'].require, errors)
await assertExists('./dist/es/packages/tuffex/packages/utils/index.d.ts', errors)
await assertExists('./dist/es/packages/tuffex/packages/utils/vibrate.d.ts', errors)
await assertExists('./dist/es/packages/tuffex/packages/utils/animation/auto-resize.d.ts', errors)

const componentSubpaths = await collectComponentSubpaths()

for (const component of componentSubpaths) {
  await assertExists(`./dist/es/${component}/index.d.ts`, errors)
  await assertExists(`./dist/es/${component}/index.js`, errors)
  await assertExists(`./dist/lib/${component}/index.js`, errors)
  await assertExists(`./dist/es/${component}/style.css`, errors)
  await assertExists(`./dist/lib/${component}/style.css`, errors)
}

const declarationFiles = await collectFiles(resolve(root, 'dist/es'), filePath => filePath.endsWith('.d.ts'))
for (const filePath of declarationFiles) {
  const source = await readFile(filePath, 'utf-8')
  errors.push(...declarationProblems(filePath.replace(`${root}/`, './'), source))
}

/**
 * The four content rules over emitted declarations. Text in, problems out.
 *
 * Three of them are plain `includes`, so a change in how vue-tsc emits these constructs would stop
 * them matching and the audit would keep reporting success. `--self-test` is what notices.
 */
export function declarationProblems(label, source) {
  const problems = []
  if (outsideUtilsPattern.test(source))
    problems.push(`${label} references package-external utils declarations`)
  if (source.includes("import('vue').GlobalComponents"))
    problems.push(`${label} references Vue GlobalComponents in emitted declarations`)
  if (source.includes("import('vue').GlobalDirectives"))
    problems.push(`${label} references Vue GlobalDirectives in emitted declarations`)
  if (/\(\(event: "[^"]+", event:/.test(source))
    problems.push(`${label} contains duplicate event parameter names in emitted declarations`)
  return problems
}

if (errors.length > 0) {
  console.error('[audit-package-exports] Missing exported files:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('[audit-package-exports] package exports are backed by dist files')

/**
 * Every case is an input the audit must reject, plus the clean ones it must accept. Same shape as
 * audit-readme-inventory.mjs, validate-plugins.mjs and the four check:* gates.
 */
function selfTest() {
  const dirent = (name, isDir = true) => ({ name, isDirectory: () => isDir })
  const cases = [
    {
      name: 'a component directory is publishable',
      run: () => publishableSubpaths([dirent('button'), dirent('input')]),
      expect: 'button,input',
    },
    {
      name: 'utils is not a publishable subpath',
      run: () => publishableSubpaths([dirent('button'), dirent('utils')]),
      expect: 'button',
    },
    {
      name: '__tests__ is not a publishable subpath',
      run: () => publishableSubpaths([dirent('button'), dirent('__tests__')]),
      expect: 'button',
    },
    {
      name: 'a file is not a publishable subpath',
      run: () => publishableSubpaths([dirent('button'), dirent('index.ts', false)]),
      expect: 'button',
    },
    {
      name: 'a clean declaration is accepted',
      run: () => declarationProblems('d.ts', "import type { Foo } from './types'\n"),
      expect: '',
    },
    {
      name: 'a package-external utils reference is caught',
      run: () => declarationProblems('d.ts', "import type { X } from '../../utils/vibrate'\n"),
      expect: 'd.ts references package-external utils declarations',
    },
    {
      name: 'a Vue GlobalComponents reference is caught',
      run: () => declarationProblems('d.ts', "declare module 'vue' { interface X extends import('vue').GlobalComponents {} }"),
      expect: 'd.ts references Vue GlobalComponents in emitted declarations',
    },
    {
      name: 'a Vue GlobalDirectives reference is caught',
      run: () => declarationProblems('d.ts', "type X = import('vue').GlobalDirectives"),
      expect: 'd.ts references Vue GlobalDirectives in emitted declarations',
    },
    {
      name: 'duplicate event parameter names are caught',
      run: () => declarationProblems('d.ts', 'declare const e: ((event: "change", event: string) => void)'),
      expect: 'd.ts contains duplicate event parameter names in emitted declarations',
    },
  ]

  let failures = 0
  for (const testCase of cases) {
    const actual = testCase.run().join(',')
    if (actual === testCase.expect) {
      console.log(`  \u001B[32m\u2713\u001B[0m ${testCase.name}`)
    }
    else {
      console.error(`  \u001B[31m\u2717\u001B[0m ${testCase.name}: expected ${JSON.stringify(testCase.expect)}, got ${JSON.stringify(actual)}`)
      failures += 1
    }
  }
  console.log(failures === 0
    ? '\naudit-package-exports self-test passed.\n'
    : `\naudit-package-exports self-test failed: ${failures} case(s).\n`)
  return failures
}
