const SUPPORTED_LOCALES = new Set(['en', 'zh'])

export function stripLocalePrefix(path: string) {
  for (const code of SUPPORTED_LOCALES) {
    const exact = `/${code}`
    if (path === exact || path === `${exact}/`)
      return '/'
    const prefixed = `${exact}/`
    if (path.startsWith(prefixed))
      return path.slice(exact.length) || '/'
  }
  return path
}

function stripContentExtension(path: string) {
  return path.replace(/\.(md|mdc)$/i, '')
}

function stripLocaleSuffix(path: string) {
  return path.replace(/\.(en|zh)$/i, '')
}

export function normalizeDocsPagePath(path: string) {
  if (!path)
    return '/docs'

  const raw = path.endsWith('/') && path.length > 1
    ? path.slice(0, -1)
    : path

  return stripLocaleSuffix(stripContentExtension(stripLocalePrefix(raw))) || '/docs'
}
