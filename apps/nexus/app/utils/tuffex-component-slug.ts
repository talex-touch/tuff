/**
 * Lightweight, zero-dependency helpers for TuffEx docs framework metadata and
 * component route slug resolution.
 *
 * Kept separate from `~/data/tuffex-framework-matrix` (which pulls the full
 * 193-module `@talex-touch/tuffex-core/compat` registry) so shared docs shells
 * (`layouts/docs.vue`, `pages/docs/[...slug].vue`, `DocsSidebar.vue`, and
 * `useDocsFramework.ts`) never pull the compatibility matrix on non-component
 * docs pages (`/docs/guide/*`) or default Vue renders.
 */

export type DocsFramework = 'vue' | 'react' | 'wc'

export interface DocsFrameworkMeta {
  id: DocsFramework
  label: string
  shortLabel: string
  packageName: string
  styleImport: string
  baseStyleImport?: string
  icon: string
  codeLang: 'vue' | 'tsx' | 'html'
}

export const DOCS_FRAMEWORKS: readonly DocsFramework[] = ['vue', 'react', 'wc'] as const

export const DOCS_FRAMEWORK_META: Readonly<Record<DocsFramework, DocsFrameworkMeta>> = {
  vue: {
    id: 'vue',
    label: 'Vue 3',
    shortLabel: 'Vue',
    packageName: '@talex-touch/tuffex',
    styleImport: '@talex-touch/tuffex/base.css',
    icon: 'i-logos-vue',
    codeLang: 'vue',
  },
  react: {
    id: 'react',
    label: 'React',
    shortLabel: 'React',
    packageName: '@talex-touch/tuffex-react',
    styleImport: '@talex-touch/tuffex-react/style.css',
    icon: 'i-logos-react',
    codeLang: 'tsx',
  },
  wc: {
    id: 'wc',
    label: 'Web Components',
    shortLabel: 'WC',
    packageName: '@talex-touch/tuffex-wc',
    styleImport: '@talex-touch/tuffex-wc/style.css',
    icon: 'i-logos-webcomponents',
    codeLang: 'html',
  },
}

/**
 * Docs pages under `/docs/dev/components/` that are overview, concept, chart,
 * or variant docs rather than exported TuffEx component modules in the
 * `@talex-touch/tuffex-core/compat` matrix.
 */
export const NON_COMPONENT_DOC_SLUGS: ReadonlySet<string> = new Set([
  'accessibility',
  'avatar-variants',
  'changelog',
  'chart-colors',
  'chat-composer',
  'custom-chart',
  'dither-chart',
  'echart-charts',
  'foundations',
  'icons',
  'index',
  'installation',
  'learning-curve',
  'maps',
  'mono-chart',
  'sankey-chart',
  'sound',
  'theming',
  'timeseries-chart',
  'typing-indicator',
  'utils',
])

export function isDocsFramework(value: unknown): value is DocsFramework {
  return value === 'vue' || value === 'react' || value === 'wc'
}

export function normalizeDocsFramework(value: unknown, fallback: DocsFramework = 'vue'): DocsFramework {
  if (typeof value !== 'string')
    return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === 'vue' || normalized === 'vue3')
    return 'vue'
  if (normalized === 'react' || normalized === 'tsx')
    return 'react'
  if (normalized === 'wc' || normalized === 'web-components' || normalized === 'webcomponents')
    return 'wc'
  return fallback
}

export function normalizeTuffexDocsPath(path: string | null | undefined): string {
  if (!path)
    return ''
  return path
    .split(/[?#]/, 1)[0]!
    .replace(/^\/(en|zh)(?=\/|$)/i, '')
    .replace(/\.(en|zh)(\.mdc?)?$/i, '')
    .replace(/\/+$/, '')
}

export function isTuffexDocsPath(path: string | null | undefined): boolean {
  const clean = normalizeTuffexDocsPath(path)
  return clean.startsWith('/docs/dev/components') || clean.startsWith('/docs/dev/tools/tuffex')
}

export function extractComponentDocSlugCandidate(path: string | null | undefined): string | null {
  const clean = normalizeTuffexDocsPath(path)
  if (!clean)
    return null
  const match = clean.match(/^\/docs\/dev\/components\/([a-z0-9-]+)$/i)
  return match ? match[1]!.toLowerCase() : null
}

/**
 * Pure route-level component slug resolver for TuffEx docs pages.
 * Returns `null` for non-component docs (guides, overviews, suites, templates,
 * and sub-pages outside the component module matrix).
 */
export function resolveComponentSlugFromPath(path: string | null | undefined): string | null {
  const candidate = extractComponentDocSlugCandidate(path)
  if (!candidate)
    return null
  if (
    NON_COMPONENT_DOC_SLUGS.has(candidate)
    || candidate.startsWith('template-')
    || candidate.endsWith('-suite')
  ) {
    return null
  }
  return candidate
}
