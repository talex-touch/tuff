/**
 * Re-implementation of the Nuxt component auto-import naming rules
 * (`@nuxt/kit` `scanComponents` + `resolveComponentNameSegments`, backed by
 * `scule`'s `splitByCase`/`pascalCase`).
 *
 * Nuxt is not importable from a plain vitest run and `.nuxt/components.d.ts`
 * only exists after `nuxt prepare`, so the guard derives names from the file
 * tree instead. `component-auto-import.test.ts` cross-checks every derived name
 * against `.nuxt/components.d.ts` whenever that artefact is present, which is
 * what keeps this copy honest.
 */

const NAME_SPLITTERS = new Set(['-', '_', '/', '.'])
const DIGIT = /\d/

function isUppercase(char: string): boolean | undefined {
  if (DIGIT.test(char))
    return undefined
  return char !== char.toLowerCase()
}

/** Port of `scule`'s `splitByCase`: splits on case boundaries and on `- _ / .`. */
export function splitByCase(input: string): string[] {
  const parts: string[] = []
  if (!input)
    return parts

  let buffer = ''
  let previousUpper: boolean | undefined
  let previousSplitter: boolean | undefined

  for (const char of input) {
    if (NAME_SPLITTERS.has(char)) {
      parts.push(buffer)
      buffer = ''
      previousUpper = undefined
      previousSplitter = true
      continue
    }

    const upper = isUppercase(char)
    if (previousSplitter === false) {
      if (previousUpper === false && upper === true) {
        parts.push(buffer)
        buffer = char
        previousUpper = upper
        continue
      }
      if (previousUpper === true && upper === false && buffer.length > 1) {
        const lastChar = buffer.at(-1) ?? ''
        parts.push(buffer.slice(0, Math.max(0, buffer.length - 1)))
        buffer = lastChar + char
        previousUpper = upper
        continue
      }
    }

    buffer += char
    previousUpper = upper
    previousSplitter = false
  }

  parts.push(buffer)
  return parts.filter(part => part.length > 0)
}

function upperFirst(input: string): string {
  return input ? input[0]!.toUpperCase() + input.slice(1) : ''
}

export function pascalCase(segments: string[]): string {
  return segments.map(upperFirst).join('')
}

/**
 * Port of Nuxt's `resolveComponentNameSegments`. Drops the directory prefix
 * segments that the file name already repeats, which is why
 * `dashboard/DashboardNav.vue` is `DashboardNav` and not `DashboardDashboardNav`.
 */
export function resolveComponentNameSegments(fileName: string, prefixParts: string[]): string[] {
  const fileNameParts = splitByCase(fileName)
  const fileNamePartsContent = fileNameParts.join('/').toLowerCase()
  const componentNameParts: string[] = prefixParts.flatMap(part => splitByCase(part))

  let index = prefixParts.length - 1
  const matchedSuffix: string[] = []
  while (index >= 0) {
    matchedSuffix.unshift(...splitByCase(prefixParts[index] ?? '').map(part => part.toLowerCase()))
    const matchedSuffixContent = matchedSuffix.join('/')
    if (
      fileNamePartsContent === matchedSuffixContent
      || fileNamePartsContent.startsWith(`${matchedSuffixContent}/`)
    ) {
      componentNameParts.length = index
      break
    }
    index -= 1
  }

  return [...componentNameParts, ...fileNameParts]
}

export interface ComponentEntry {
  /** `apps/nexus`-relative path. */
  path: string
  /** File name without extension or `.client`/`.server` suffix. */
  baseName: string
  /** The name Nuxt registers for auto-import, e.g. `DashboardAdminAccountTabs`. */
  autoImportName: string
  /** Directory segments between the scanned root and the file. */
  prefixParts: string[]
}

/** A directory Nuxt scans for components, in `addComponentsDir` terms. */
export interface ComponentScanDir {
  /** `apps/nexus`-relative directory. */
  path: string
  /** `false` mirrors `addComponentsDir({ pathPrefix: false })`: no directory prefix. */
  pathPrefix: boolean
}

/**
 * `~/components` is registered by `nuxt.config.ts`; `~/components/content` is
 * registered a second time by `@nuxt/content` with `pathPrefix: false` so MDC
 * can address those components by bare name. The more specific directory wins,
 * which is why `content/TuffCodeBlock.vue` is `TuffCodeBlock`, not
 * `ContentTuffCodeBlock`.
 */
export const nexusComponentScanDirs: ComponentScanDir[] = [
  { path: 'app/components', pathPrefix: true },
  { path: 'app/components/content', pathPrefix: false },
]

const KNOWN_EXTENSIONS = ['.vue', '.ts', '.tsx', '.js', '.jsx', '.mjs']

function resolveScanDir(relativePath: string, scanDirs: ComponentScanDir[]): ComponentScanDir {
  const matches = scanDirs
    .filter(dir => relativePath.startsWith(`${dir.path}/`))
    .sort((left, right) => right.path.length - left.path.length)
  return matches[0] ?? scanDirs[0]!
}

/**
 * @param relativePath `apps/nexus`-relative path of the component file.
 * @param scanDirs     Directories Nuxt scans; defaults to this app's set.
 */
export function deriveComponentEntry(
  relativePath: string,
  scanDirs: ComponentScanDir[] = nexusComponentScanDirs,
): ComponentEntry {
  const scanDir = resolveScanDir(relativePath, scanDirs)
  const withinRoot = relativePath.slice(scanDir.path.length).replace(/^\//, '')
  const segments = withinRoot.split('/')
  const rawFileName = segments.pop() ?? ''
  const prefixParts = scanDir.pathPrefix && segments.length > 0 ? splitByCase(segments.join('/')) : []

  const extension = KNOWN_EXTENSIONS.find(candidate => rawFileName.endsWith(candidate)) ?? ''
  let fileName = extension ? rawFileName.slice(0, -extension.length) : rawFileName
  if (fileName.endsWith('.client') || fileName.endsWith('.server'))
    fileName = fileName.slice(0, fileName.lastIndexOf('.'))

  const baseName = fileName
  // `foo/index.vue` registers as `Foo`: Nuxt drops the file name entirely.
  if (fileName.toLowerCase() === 'index')
    fileName = ''

  const nameSegments = resolveComponentNameSegments(fileName.replace(/["']/g, ''), prefixParts)
  return {
    path: relativePath,
    baseName,
    autoImportName: pascalCase(nameSegments),
    prefixParts,
  }
}
