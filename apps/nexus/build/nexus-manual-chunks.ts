const TUFFEX_CORE_STYLE_COMPONENTS = new Set([
  'base-anchor',
  'base-surface',
  'button',
  'card',
  'flow-light',
  'icon',
  'popover',
  'spinner',
  'status-icon',
  'text-morph',
  'text-transformer',
  'tooltip',
])

const TUFFEX_LIQUID_STYLE_COMPONENTS = new Set([
  'flat-radio',
  'liquid',
])

const TUFFEX_DATA_STYLE_COMPONENTS = new Set([
  'auto-sizer',
  'avatar',
  'card-item',
  'checkbox',
  'data-table',
  'dropdown-menu',
  'edge-fade-mask',
  'empty',
  'empty-state',
  'filter-chips',
  'input',
  'no-data',
  'number-input',
  'rating',
  'search-empty',
  'search-input',
  'select',
  'skeleton',
  'status-badge',
  'tag',
])

const HEADER_COMPONENT_PATTERN = /\/app\/components\/(?:TheHeader|HeaderControls|HeaderIconButton|DarkToggle|LanguageToggle|icon\/Logo)\.vue$/
const DOCS_LAYOUT_COMPONENT_PATTERN = /\/app\/(?:layouts\/docs|components\/DocsOutline|components\/DocsSidebar|components\/docs\/DocsAsideCardsShell|components\/docs\/DocsCopyPromptButton)\.vue$/
const DOCS_SURFACE_STYLE_PATTERN = /\/app\/(?:layouts\/docs|components\/DocsOutline|components\/DocsSidebar|components\/docs\/(?:DocsAsideCardsShell|DocsCopyPromptButton)|components\/content\/TuffCodeBlockRenderer)\.vue$/
const LANDING_IMAGE_ASSET_PATTERN = /\/app\/images\/assets\//
const TUFFEX_DIST_COMPONENT_PATTERN = /\/packages\/tuffex\/dist\/es\/([^/]+)\//
const TUFFEX_UTILS_PATTERN = /\/packages\/tuffex\/dist\/es\/utils\//

/**
 * Strictly eager core runtime packages ALWAYS statically imported by `entry.js` on every page
 * (Vue 3, Vue Router, Unhead, Vue i18n, Pinia, ofetch, core Nuxt utility libraries, and Vite's
 * `plugin-vue:export-helper`). Matches `apps/tuffex-docs/build/tuffex-manual-chunks.ts`: grouping
 * ONLY these eager packages eliminates tiny core micro-chunks without bloating initial transfer
 * size or ever pulling lazy libraries (`sentry`, `mermaid`, `echarts`, `gsap`, `ogl`, `workbox`,
 * `@floating-ui`, `@nuxtjs/mdc`) into `entry.js`.
 */
const NUXT_VUE_CORE_PATTERN = /(?:\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:@vue\/|vue\/|vue-router\/|@unhead\/|unhead\/|ufo\/|ohash\/|defu\/|klona\/|cookie-es\/|destr\/|hookable\/|perfect-debounce\/|devalue\/|scule\/|@intlify\/|vue-i18n\/|pinia\/|ofetch\/)|plugin-vue:export-helper)/

export const DEFAULT_NEXUS_ROLLDOWN_MIN_SIZE = 16384
export const DEFAULT_NEXUS_INLINE_COMMON_CHUNKS_MAX_SIZE = 6144

/**
 * Consolidates tiny shared header/docs SFCs, strictly eager core runtime, TuffEx utilities, and
 * TuffEx style-only dependency entrypoints into predictable family chunks without pulling
 * unrelated app code across routes. Landing image URL stubs stay isolated so Rolldown
 * `codeSplitting.minSize` never folds them into shared Nuxt runtime chunks.
 *
 * Deliberately NEVER defines `vendor-*` groups so Rolldown never hoists Vue runtime
 * helpers into third-party vendor chunks.
 */
export function resolveNexusManualChunk(id: string): string | undefined {
  const cleanId = (id.split('?')[0] ?? id).replace(/\\/g, '/')
  if (LANDING_IMAGE_ASSET_PATTERN.test(cleanId))
    return 'nexus-landing-assets'

  const isStyleAsset = cleanId.endsWith('.css') || id.includes('type=style')
  if (!isStyleAsset) {
    if (NUXT_VUE_CORE_PATTERN.test(cleanId))
      return 'nuxt-vue-core'
    if (TUFFEX_UTILS_PATTERN.test(cleanId))
      return 'tuffex-utils'
    if (HEADER_COMPONENT_PATTERN.test(cleanId))
      return 'nexus-header-controls'
    if (DOCS_LAYOUT_COMPONENT_PATTERN.test(cleanId))
      return 'docs-layout'
    return undefined
  }

  if (HEADER_COMPONENT_PATTERN.test(cleanId))
    return 'nexus-header'
  if (DOCS_SURFACE_STYLE_PATTERN.test(cleanId))
    return 'docs-surface'

  const tuffexMatch = cleanId.match(TUFFEX_DIST_COMPONENT_PATTERN)
  if (!tuffexMatch)
    return undefined

  const componentName = tuffexMatch[1]!
  if (componentName === 'radio' || componentName === 'glass-surface')
    return 'tuffex-radio-styles'
  if (TUFFEX_LIQUID_STYLE_COMPONENTS.has(componentName))
    return 'tuffex-liquid-styles'
  if (TUFFEX_CORE_STYLE_COMPONENTS.has(componentName))
    return 'tuffex-core-styles'
  if (TUFFEX_DATA_STYLE_COMPONENTS.has(componentName))
    return 'tuffex-data-styles'

  return undefined
}

/**
 * Rolldown-safe client `output.codeSplitting` configuration for Vite 8:
 * - `minSize: 16384` + `experimentalInlineCommonChunks: { maxSize: 6144 }` (paired with
 *   `preserveEntrySignatures: false`) collapses dozens of tiny JS micro-chunks.
 * - `includeDependenciesRecursively: false` keeps explicit groups strictly non-recursive so
 *   `nuxt-vue-core`, `tuffex-utils`, `docs-layout`, `nexus-header-controls`, and
 *   `nexus-landing-assets` never pull unrelated UI libraries across routes.
 */
export function createNexusCodeSplittingConfig(minSize = DEFAULT_NEXUS_ROLLDOWN_MIN_SIZE) {
  return {
    minSize,
    includeDependenciesRecursively: false,
    experimentalInlineCommonChunks: {
      maxSize: DEFAULT_NEXUS_INLINE_COMMON_CHUNKS_MAX_SIZE,
    },
    groups: [
      {
        debugName: 'nexus-manual-chunks',
        name: (id: string) => resolveNexusManualChunk(id) ?? null,
        includeDependenciesRecursively: false,
        minSize: 0,
        priority: 10,
      },
    ],
  }
}
