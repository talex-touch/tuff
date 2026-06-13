import { spawn } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const rootPath = resolve(__dirname, '../../..')
const distEsPath = resolve(rootPath, 'dist/es')
const utilsSourcePath = resolve(rootPath, 'packages/utils')
const utilsTypesOutPath = resolve(distEsPath, 'packages/tuffex/packages/utils')

function quoteWindowsShellArg(value: string) {
  return /[\s"]/g.test(value)
    ? `"${value.replace(/"/g, '\\"')}"`
    : value
}

function runPnpm(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', ['pnpm', ...args].map(quoteWindowsShellArg).join(' ')], {
        cwd: rootPath,
        shell: false,
        stdio: 'inherit',
      })
      : spawn('pnpm', args, {
        cwd: rootPath,
        shell: false,
        stdio: 'inherit',
      })

    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`pnpm exited by signal ${signal}`))
        return
      }
      if (code) {
        reject(new Error(`pnpm exited with code ${code}`))
        return
      }
      resolve()
    })
  })
}

async function collectFiles(dir: string, predicate: (filePath: string) => boolean): Promise<string[]> {
  const dirents = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    dirents.map(async (dirent) => {
      const filePath = resolve(dir, dirent.name)
      if (dirent.isDirectory())
        return collectFiles(filePath, predicate)
      return predicate(filePath) ? [filePath] : []
    }),
  )
  return files.flat()
}

function toModuleSpecifier(fromFile: string, targetPath: string) {
  const specifier = relative(dirname(fromFile), targetPath).replaceAll('\\', '/')
  return specifier.startsWith('.') ? specifier : `./${specifier}`
}

function toDistUtilsSpecifier(fromFile: string, subpath = '') {
  const target = subpath
    ? resolve(utilsTypesOutPath, `.${subpath}`)
    : resolve(utilsTypesOutPath, 'index')
  return toModuleSpecifier(fromFile, target)
}

async function emitUtilsDeclarations() {
  await runPnpm([
    'exec',
    'tsc',
    '--declaration',
    '--emitDeclarationOnly',
    '--declarationMap',
    'false',
    '--outDir',
    utilsTypesOutPath,
    '--rootDir',
    utilsSourcePath,
    '--module',
    'ESNext',
    '--target',
    'ES2020',
    '--moduleResolution',
    'bundler',
    '--strict',
    '--skipLibCheck',
    '--esModuleInterop',
    '--lib',
    'DOM,DOM.Iterable,ESNext',
    resolve(utilsSourcePath, 'index.ts'),
  ])
}

async function emitUtilsEntryDeclaration() {
  const entryPath = resolve(distEsPath, 'utils/index.d.ts')
  const specifier = toDistUtilsSpecifier(entryPath)

  await writeFile(entryPath, `export * from '${specifier}';\n`)
}

async function rewriteUtilsReferences() {
  const declarationFiles = await collectFiles(distEsPath, filePath => filePath.endsWith('.d.ts'))
  const outsideUtilsPattern = /(['"])((?:\.\.\/)+utils((?:\/[\w.-]+)*))\1/g

  await Promise.all(
    declarationFiles.map(async (filePath) => {
      const source = await readFile(filePath, 'utf-8')
      const next = source.replace(
        outsideUtilsPattern,
        (_match, quote: string, _specifier: string, subpath = '') =>
          `${quote}${toDistUtilsSpecifier(filePath, subpath)}${quote}`,
      )

      if (next !== source)
        await writeFile(filePath, next)
    }),
  )
}

async function rewriteVueGlobalComponentReferences() {
  const declarationFiles = await collectFiles(distEsPath, filePath => filePath.endsWith('.d.ts'))
  const globalComponentsPattern = /import\(['"]vue['"]\)\.GlobalComponents/g
  const globalDirectivesPattern = /import\(['"]vue['"]\)\.GlobalDirectives/g
  const duplicateEmitEventParamPattern = /\(\(event: ("[^"]+"), event:/g

  await Promise.all(
    declarationFiles.map(async (filePath) => {
      const source = await readFile(filePath, 'utf-8')
      const next = source
        .replace(globalComponentsPattern, 'Record<string, any>')
        .replace(globalDirectivesPattern, 'Record<string, any>')
        .replace(duplicateEmitEventParamPattern, '((event: $1, payload:')

      if (next !== source)
        await writeFile(filePath, next)
    }),
  )
}

export async function fixComponentDeclarations() {
  await emitUtilsDeclarations()
  await emitUtilsEntryDeclaration()
  await rewriteUtilsReferences()
  await rewriteVueGlobalComponentReferences()
}

export default fixComponentDeclarations
