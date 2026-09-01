import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')

async function run(command, args, cwd) {
  await execFileAsync(command, args, {
    cwd,
    maxBuffer: 1024 * 1024 * 10,
  })
}

async function runPnpm(args, cwd) {
  const npmExecPath = process.env.npm_execpath
  if (npmExecPath && /(?:^|[/\\])pnpm(?:\.(?:cjs|mjs|js))?$/i.test(npmExecPath)) {
    if (/\.(?:cjs|mjs|js)$/i.test(npmExecPath)) {
      await run(process.execPath, [npmExecPath, ...args], cwd)
      return
    }

    await run(npmExecPath, args, cwd)
    return
  }

  await run('pnpm', args, cwd)
}

/** The sample the audit typechecks. Named so `--self-test` can assert it still exercises the surface. */
export const SAMPLE_SOURCE = `import { TxButton, type TxButtonProps } from '@talex-touch/tuffex/button'
import { asTrustedDialogHtml, type TouchTipProps, type TrustedDialogHtml } from '@talex-touch/tuffex/dialog'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxSelect, type TxSelectValue } from '@talex-touch/tuffex/select'
import { useVibrate, type VibrateType } from '@talex-touch/tuffex/utils'

const variant: TxButtonProps['variant'] = 'primary'
const value: TxSelectValue = 'demo'
const vibrateType: VibrateType = 'light'
const trustedHtml: TrustedDialogHtml = asTrustedDialogHtml('<strong>trusted</strong>')
const touchTipProps: TouchTipProps = {
  messageHtml: trustedHtml,
  buttons: [],
  close: () => {},
}

// @ts-expect-error Dialog HTML must be explicitly marked trusted.
const unsafeHtml: TrustedDialogHtml = '<strong>unsafe</strong>'

useVibrate(vibrateType)
console.log(Boolean(TxButton), Boolean(TxInput), Boolean(TxSelect), variant, value, touchTipProps, unsafeHtml)
`

/** The compiler options the sample is checked under. */
export const TSCONFIG = {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      skipLibCheck: false,
      lib: ['DOM', 'DOM.Iterable', 'ESNext'],
    },
    include: ['index.ts'],
  }

/** Subpaths the sample is meant to cover. Losing one silently shrinks what the audit proves. */
export const COVERED_SUBPATHS = ['button', 'dialog', 'input', 'select', 'utils']

/**
 * What this audit rests on besides tsc.
 *
 * tsc reports real errors loudly, so the failure worth guarding is the harness quietly checking
 * less: a sample that stops importing a subpath, a sample with no `@ts-expect-error` left (nothing
 * then proves tsc is type-checking rather than merely resolving), or skipLibCheck flipped to true
 * -- measured: with it true, every declaration error in this package disappears (#1589).
 */
export function harnessProblems(sample, tsconfig, covered = COVERED_SUBPATHS) {
  const problems = []
  for (const subpath of covered) {
    if (!sample.includes(`@talex-touch/tuffex/${subpath}`))
      problems.push(`sample no longer imports @talex-touch/tuffex/${subpath}`)
  }
  if (!sample.includes('@ts-expect-error'))
    problems.push('sample has no @ts-expect-error left, so nothing proves tsc is checking types')
  if (tsconfig?.compilerOptions?.skipLibCheck !== false)
    problems.push('skipLibCheck must stay false or the published declarations are not checked')
  if (tsconfig?.compilerOptions?.strict !== true)
    problems.push('strict must stay true')
  return problems
}

function selfTest() {
  const strip = (source, subpath) => source.replace(`@talex-touch/tuffex/${subpath}`, '@talex-touch/tuffex/other')
  const opts = extra => ({ compilerOptions: { ...TSCONFIG.compilerOptions, ...extra } })
  const cases = [
    { name: 'the shipped sample and tsconfig pass', run: () => harnessProblems(SAMPLE_SOURCE, TSCONFIG), expect: '' },
    { name: 'a dropped subpath import is caught', run: () => harnessProblems(strip(SAMPLE_SOURCE, 'select'), TSCONFIG), expect: 'sample no longer imports @talex-touch/tuffex/select' },
    { name: 'a sample with no ts-expect-error is caught', run: () => harnessProblems(SAMPLE_SOURCE.replace('@ts-expect-error', 'ts-was-expected'), TSCONFIG), expect: 'sample has no @ts-expect-error left, so nothing proves tsc is checking types' },
    { name: 'skipLibCheck flipped to true is caught', run: () => harnessProblems(SAMPLE_SOURCE, opts({ skipLibCheck: true })), expect: 'skipLibCheck must stay false or the published declarations are not checked' },
    { name: 'strict turned off is caught', run: () => harnessProblems(SAMPLE_SOURCE, opts({ strict: false })), expect: 'strict must stay true' },
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
  console.log(failures === 0 ? '\naudit-package-types self-test passed.\n' : `\naudit-package-types self-test failed: ${failures} case(s).\n`)
  return failures
}

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

const workspace = await mkdtemp(join(tmpdir(), 'tuffex-types-'))

// Install the tarball, not the source directory.
//
// `file:${root}` made pnpm read the raw package.json, workspace protocol and all, so the
// install died on `@talex-touch/utils@workspace:^` -- unresolvable outside the monorepo.
// That specifier was added after this script was written, which is when the audit stopped
// running; nothing in CI ran it, so nothing said so (#1555). `pnpm pack` rewrites workspace
// specifiers to the versions a published consumer resolves, which is also what this audit
// is supposed to be checking.
/** Packs one workspace package into `workspace` and returns its tarball path. */
async function packWorkspacePackage(packageRoot) {
  const before = new Set(await readdir(workspace))
  await runPnpm(['pack', '--pack-destination', workspace], packageRoot)
  const added = (await readdir(workspace)).filter(
    entry => entry.endsWith('.tgz') && !before.has(entry),
  )
  if (added.length !== 1) {
    throw new Error(
      `[audit-package-types] expected one new tarball from ${packageRoot}, found ${added.length}`,
    )
  }
  return join(workspace, added[0])
}

const tarball = await packWorkspacePackage(root)

/*
 * Sibling `@talex-touch/*` dependencies are packed too, and pinned through
 * `pnpm.overrides`.
 *
 * `pnpm pack` rewrites `workspace:^` to the version a published consumer would
 * resolve, which is the whole point of packing rather than installing the source
 * directory — but it uses the version currently in the workspace. During a
 * release that version does not exist on the registry yet, so the scratch
 * install 404s and the audit fails for a reason that has nothing to do with the
 * type surface it exists to check. Resolving siblings from the workspace makes
 * the audit answer the question it is actually asking: do these declarations
 * compile against the code being shipped alongside them.
 */
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const siblings = Object.keys(manifest.dependencies ?? {}).filter(name =>
  name.startsWith('@talex-touch/'),
)

const overrides = {}
for (const name of siblings) {
  const siblingRoot = resolve(root, '..', name.slice('@talex-touch/'.length))
  overrides[name] = `file:${await packWorkspacePackage(siblingRoot)}`
}

await writeFile(
  join(workspace, 'package.json'),
  JSON.stringify({
    type: 'module',
    dependencies: {
      '@talex-touch/tuffex': `file:${tarball}`,
      typescript: '^5.9.3',
      vue: '^3.5.33',
    },
    ...(Object.keys(overrides).length ? { pnpm: { overrides } } : {}),
  }),
)

/*
 * The same overrides again, in the other place pnpm looks for them.
 *
 * pnpm 10 reads the `pnpm` field in package.json; pnpm 11 ignores it and reads
 * `pnpm-workspace.yaml` instead ("The 'pnpm' field in package.json is no longer
 * read by pnpm"). Writing both keeps this audit working either side of that
 * migration rather than silently losing the overrides and 404ing again.
 */
if (Object.keys(overrides).length) {
  const yaml = ['overrides:']
  for (const [name, spec] of Object.entries(overrides))
    yaml.push(`  '${name}': '${spec}'`)
  await writeFile(join(workspace, 'pnpm-workspace.yaml'), `${yaml.join('\n')}\n`)
}

await writeFile(join(workspace, 'index.ts'), SAMPLE_SOURCE)

await writeFile(join(workspace, 'tsconfig.json'), JSON.stringify(TSCONFIG))

await runPnpm(['install', '--ignore-scripts', '--silent'], workspace)
await runPnpm(['exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'], workspace)

console.log('[audit-package-types] package subpath declarations compile in an external project')
