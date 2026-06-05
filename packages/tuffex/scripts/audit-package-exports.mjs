import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')
const componentSrcRoot = resolve(root, 'packages/components/src')
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
  return dirents
    .filter(dirent => dirent.isDirectory() && dirent.name !== 'utils')
    .map(dirent => dirent.name)
    .sort()
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
const outsideUtilsPattern = /['"](?:\.\.\/)+utils(?:\/[\w.-]+)*['"]/
for (const filePath of declarationFiles) {
  const source = await readFile(filePath, 'utf-8')
  if (outsideUtilsPattern.test(source)) {
    errors.push(`${filePath.replace(`${root}/`, './')} references package-external utils declarations`)
  }
  if (source.includes("import('vue').GlobalComponents")) {
    errors.push(`${filePath.replace(`${root}/`, './')} references Vue GlobalComponents in emitted declarations`)
  }
  if (source.includes("import('vue').GlobalDirectives")) {
    errors.push(`${filePath.replace(`${root}/`, './')} references Vue GlobalDirectives in emitted declarations`)
  }
  if (/\(\(event: "[^"]+", event:/.test(source)) {
    errors.push(`${filePath.replace(`${root}/`, './')} contains duplicate event parameter names in emitted declarations`)
  }
}

if (errors.length > 0) {
  console.error('[audit-package-exports] Missing exported files:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('[audit-package-exports] package exports are backed by dist files')
