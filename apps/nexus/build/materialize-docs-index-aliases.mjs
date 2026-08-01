import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function walkFiles(dir) {
  if (!existsSync(dir))
    return []

  const files = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...walkFiles(fullPath))
      continue
    }
    if (stats.isFile())
      files.push(fullPath)
  }
  return files
}

export function materializeDocsIndexAliases(distRoot) {
  const aliases = []

  for (const locale of ['en', 'zh']) {
    const docsRoot = join(distRoot, locale, 'docs')
    if (!existsSync(docsRoot))
      throw new Error(`[nexus-docs-aliases] localized docs output is missing: ${locale}`)

    for (const sourcePath of walkFiles(docsRoot)) {
      const relativePath = relative(docsRoot, sourcePath).replace(/\\/g, '/')
      if (relativePath !== 'index/index.html' && !relativePath.endsWith('/index/index.html'))
        continue

      const targetPath = sourcePath.slice(0, -'index/index.html'.length) + 'index.html'
      const targetRoute = `/${relative(distRoot, targetPath)
        .replace(/\\/g, '/')
        .replace(/\/index\.html$/, '')}`
      copyFileSync(sourcePath, targetPath)
      aliases.push({
        route: targetRoute,
        sourcePath,
        targetPath,
      })
    }
  }

  if (!aliases.length)
    throw new Error('[nexus-docs-aliases] no localized index documents were found')

  return aliases.sort((a, b) => a.route.localeCompare(b.route))
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const distRoot = resolve(dirname(currentFile), '..', 'dist')
  const aliases = materializeDocsIndexAliases(distRoot)
  console.log(`[nexus-docs-aliases] materialized ${aliases.length} directory index aliases`)
}
