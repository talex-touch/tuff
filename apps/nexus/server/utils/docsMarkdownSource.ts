import {
  buildDocsContentCandidates,
  docsContentRoots,
  isFileNotFound,
  isInsideDocsRoot,
} from './docsContentFile'

/**
 * Reads the Markdown a docs page was built from, for the `/<locale>/docs/<path>.md` route.
 *
 * Deliberately filesystem-only. The build prerenders every one of these routes into a static
 * file while it still runs on Node; the deployed Cloudflare Worker has no filesystem, so a
 * request that somehow reaches it there returns `null` and the route answers 404 rather than
 * inventing a body. Nuxt Content's stored record is not a substitute: it holds the parsed AST,
 * and re-serializing it would hand agents a reconstruction rather than the source.
 */

/** Candidate paths for a doc, mirroring the resolver's locale-first lookup order. */
function buildLocalizedLookupPaths(docPath: string, locale: 'en' | 'zh') {
  const baseDocPath = docPath.replace(/\/index$/, '')
  const shouldTryIndex = !docPath.endsWith('/index')

  return [
    `${docPath}.${locale}`,
    ...(shouldTryIndex ? [`${baseDocPath}/index.${locale}`] : []),
    docPath,
    ...(shouldTryIndex ? [`${baseDocPath}/index`] : []),
  ]
}

async function readContentFile(contentPath: string): Promise<string | null> {
  const candidates = buildDocsContentCandidates(contentPath)
  if (!candidates.length)
    return null

  const [{ readFile }, { resolve, sep }] = await Promise.all([
    import('node:fs/promises'),
    import('node:path'),
  ])

  for (const relativeFile of candidates) {
    for (const docsRoot of docsContentRoots(resolve)) {
      const filePath = resolve(docsRoot, relativeFile)
      if (!isInsideDocsRoot(filePath, docsRoot, sep))
        continue

      try {
        return await readFile(filePath, 'utf8')
      }
      catch (error) {
        if (isFileNotFound(error))
          continue
        throw error
      }
    }
  }

  return null
}

/** The raw Markdown for a docs page, or `null` when no source file backs it. */
export async function readDocsMarkdownSource(docPath: string, locale: 'en' | 'zh') {
  for (const contentPath of buildLocalizedLookupPaths(docPath, locale)) {
    const source = await readContentFile(contentPath)
    if (source !== null)
      return source
  }

  return null
}
