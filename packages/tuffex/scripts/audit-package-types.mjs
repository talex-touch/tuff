import { mkdtemp, writeFile } from 'node:fs/promises'
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
  if (npmExecPath && /(?:^|[/\\])pnpm(?:\.cjs)?$/i.test(npmExecPath)) {
    await run(process.execPath, [npmExecPath, ...args], cwd)
    return
  }

  await run('pnpm', args, cwd)
}

const workspace = await mkdtemp(join(tmpdir(), 'tuffex-types-'))

await writeFile(
  join(workspace, 'package.json'),
  JSON.stringify({
    type: 'module',
    dependencies: {
      '@talex-touch/tuffex': `file:${root}`,
      typescript: '^5.9.3',
      vue: '^3.5.33',
    },
  }),
)

await writeFile(
  join(workspace, 'index.ts'),
  `import { TxButton, type TxButtonProps } from '@talex-touch/tuffex/button'
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
`,
)

await writeFile(
  join(workspace, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      skipLibCheck: false,
      lib: ['DOM', 'DOM.Iterable', 'ESNext'],
    },
    include: ['index.ts'],
  }),
)

await runPnpm(['install', '--ignore-scripts', '--silent'], workspace)
await runPnpm(['exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'], workspace)

console.log('[audit-package-types] package subpath declarations compile in an external project')
