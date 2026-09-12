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

/**
 * A directory route (`/en/docs/dev`) and its index document (`/en/docs/dev/index`) are the
 * same page, but only the latter is a prerender input. With `autoSubfolderIndex: false` nitro
 * writes it to `en/docs/dev/index.html`, which Cloudflare Pages serves at `/en/docs/dev/index`
 * and `/en/docs/dev/` — never at `/en/docs/dev`. Copying it to `en/docs/dev.html` gives the
 * slash-less directory route a static file of its own, so it is served without a redirect and
 * without falling through to the Worker.
 *
 * The docs root is the one exception: `en/docs/index.html` aliases to `en/docs.html`.
 */
export function materializeDocsIndexAliases(distRoot) {
  const aliases = []

  for (const locale of ['en', 'zh']) {
    const docsRoot = join(distRoot, locale, 'docs')
    if (!existsSync(docsRoot))
      throw new Error(`[nexus-docs-aliases] localized docs output is missing: ${locale}`)

    for (const sourcePath of walkFiles(docsRoot)) {
      const relativePath = relative(docsRoot, sourcePath).replace(/\\/g, '/')
      if (relativePath !== 'index.html' && !relativePath.endsWith('/index.html'))
        continue

      const targetPath = `${sourcePath.slice(0, -'/index.html'.length)}.html`
      const targetRoute = `/${relative(distRoot, targetPath)
        .replace(/\\/g, '/')
        .replace(/\.html$/, '')}`
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
