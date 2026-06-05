import { execFile } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const rootPath = resolve(__dirname, '../../..')
const distEsPath = resolve(rootPath, 'dist/es')
const utilsSourcePath = resolve(rootPath, 'packages/utils')
const utilsTypesOutPath = resolve(distEsPath, 'packages/tuffex/packages/utils')
const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

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
  await execFileAsync(pnpmBin, [
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
  ], {
    cwd: rootPath,
  })
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
  await rewriteUtilsReferences()
  await rewriteVueGlobalComponentReferences()
}

export default fixComponentDeclarations
