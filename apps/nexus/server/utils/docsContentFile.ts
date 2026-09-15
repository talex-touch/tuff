import process from 'node:process'

/**
 * Locating the Markdown file behind a docs path. Shared by the page resolver's development
 * fallback and the raw-source route, which must agree on which file a path names — a second
 * copy of the traversal guard below is exactly the bug worth preventing.
 */

/** `/docs/dev/api` -> `dev/api`; the docs root becomes `index`. `null` for non-docs paths. */
export function normalizeDocsContentStem(contentPath: string) {
  if (contentPath === '/docs')
    return 'index'

  if (contentPath.startsWith('/docs/'))
    return contentPath.slice('/docs/'.length) || 'index'

  // `/docs.en` names the localized root document.
  if (contentPath.startsWith('/docs.'))
    return `index${contentPath.slice('/docs'.length)}`

  return null
}

export function isSafeContentStem(stem: string) {
  if (!stem || stem.includes('\0'))
    return false

  return stem
    .split('/')
    .every(segment => segment && segment !== '.' && segment !== '..')
}

/** The candidate file names for a docs path, in the order Nuxt Content would resolve them. */
export function buildDocsContentCandidates(contentPath: string) {
  const stem = normalizeDocsContentStem(contentPath)
  if (!stem || !isSafeContentStem(stem))
    return []

  return [`${stem}.mdc`, `${stem}.md`]
}

export function isFileNotFound(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error))
    return false

  return error.code === 'ENOENT'
}

/**
 * Both layouts the process may be started from: the Nexus directory itself, and the workspace
 * root during a monorepo build.
 */
export function docsContentRoots(resolve: (...parts: string[]) => string) {
  return [
    resolve(process.cwd(), 'content/docs'),
    resolve(process.cwd(), 'apps/nexus/content/docs'),
  ]
}

/**
 * Whether `filePath` stayed inside `docsRoot`. `buildDocsContentCandidates` already rejects
 * `..` segments; this re-checks the resolved path so an encoded or symlinked escape cannot
 * turn a docs URL into an arbitrary file read.
 */
export function isInsideDocsRoot(filePath: string, docsRoot: string, separator: string) {
  return filePath === docsRoot || filePath.startsWith(`${docsRoot}${separator}`)
}
