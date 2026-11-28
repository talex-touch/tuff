const NAV_EN_PATTERN = /tuff-web-docs-nav-en\.mjs$/
const NAV_ZH_PATTERN = /tuff-web-docs-nav-zh\.mjs$/

/**
 * Strictly eager core runtime packages statically imported by `entry.js` on every page
 * (Vue 3, Vue Router, Unhead, Vue i18n, Nuxt core utilities, and Vite's export-helper).
 * Grouping ONLY these eager packages eliminates micro-chunks without pulling lazy libs
 * (`ogl`, `gsap`, `mermaid`, `katex`, etc.) into `entry.js`.
 */
const NUXT_VUE_CORE_PATTERN = /(?:\/node_modules\/(?:@vue\/|vue\/|vue-router\/|@unhead\/|unhead\/|ufo\/|ohash\/|defu\/|klona\/|cookie-es\/|destr\/|hookable\/|perfect-debounce\/|devalue\/|scule\/|@intlify\/|vue-i18n\/)|plugin-vue:export-helper)/

const TUFFEX_PRIMITIVES_PATTERN = /\/packages\/tuffex\/dist\/es\/(?:utils|base-anchor|base-surface|floating|button|icon|spinner|tooltip|popover|card|liquid|glass-surface|flow-light|text-morph|text-transformer|edge-fade-mask|icon-morph|auto-sizer|stagger)\//
const TUFFEX_UI_CORE_PATTERN = /\/packages\/tuffex\/dist\/es\/(?:badge|blank-slate|card-item|collapse|container|divider|dot-indicator|empty|empty-state|error-state|flex|grid|guide-state|icon-chip|kbd|layout-skeleton|loading-overlay|loading-state|no-data|no-selection|offline-state|permission-state|progress|progress-bar|scroll|search-empty|skeleton|splitter|stack|stat-card|status-badge|status-hint|tag|text|toast|toast-panel|version-capsule)\//
const TUFFEX_UI_FORM_PATTERN = /\/packages\/tuffex\/dist\/es\/(?:avatar|cascader|checkbox|choice-card|date-picker|drawer-form|file-uploader|filter-chips|flat-radio|flat-select|form|group-block|icon-picker|image-uploader|input|modal-form|number-input|picker|radio|rating|scrub-field|search-input|search-select|segmented-slider|select|sensitive-input|slider|steps-form|switch|tag-input|textarea|transfer|tree-select)\//
const TUFFEX_UI_NAV_PATTERN = /\/packages\/tuffex\/dist\/es\/(?:alert|breadcrumb|cell-link|command-palette|context-menu|corner-overlay|data-table|descriptions|dialog|drawer|dropdown-menu|flat-dropdown|grid-layout|modal|nav-bar|pagination|search-panel|selection-actions|sidebar-nav|sortable-list|steps|tab-bar|tabs|timeline|tree)\//
const TUFFEX_UI_MOTION_PATTERN = /\/packages\/tuffex\/dist\/es\/(?:border-beam|card-spread|distortion-wave|flip-book|flip-overlay|fold-page|glow-text|gradient-border|gradual-blur|keyframe-stroke-text|metal-fx|morph|motion|motion-button|motion-control|motion-dock|motion-form|motion-loader|motion-transition|physics-motion|pixel-field|prism-glow|transition|tuff-logo-stroke|voice-ring)\//

export const DEFAULT_ROLLDOWN_MIN_SIZE = 16384
export const DEFAULT_INLINE_COMMON_CHUNKS_MAX_SIZE = 6144

export interface TuffWebCodeSplittingGroup {
  name: string
  test: RegExp
  minSize?: number
  priority?: number
  includeDependenciesRecursively: false
}

export interface TuffWebCodeSplittingConfig {
  minSize: number
  includeDependenciesRecursively: false
  groups: TuffWebCodeSplittingGroup[]
  experimentalInlineCommonChunks?: {
    maxSize: number
  }
}

export function createTuffWebCodeSplittingConfig(
  minSize = DEFAULT_ROLLDOWN_MIN_SIZE,
): TuffWebCodeSplittingConfig {
  return {
    minSize,
    includeDependenciesRecursively: false,
    experimentalInlineCommonChunks: {
      maxSize: DEFAULT_INLINE_COMMON_CHUNKS_MAX_SIZE,
    },
    groups: [
      {
        name: 'tuff-web-nav-en',
        test: NAV_EN_PATTERN,
        minSize: 0,
        priority: 40,
        includeDependenciesRecursively: false,
      },
      {
        name: 'tuff-web-nav-zh',
        test: NAV_ZH_PATTERN,
        minSize: 0,
        priority: 40,
        includeDependenciesRecursively: false,
      },
      {
        name: 'nuxt-vue-core',
        test: NUXT_VUE_CORE_PATTERN,
        minSize: 0,
        priority: 30,
        includeDependenciesRecursively: false,
      },
      {
        name: 'tuffex-primitives',
        test: TUFFEX_PRIMITIVES_PATTERN,
        minSize: 0,
        priority: 25,
        includeDependenciesRecursively: false,
      },
      {
        name: 'tuffex-ui-core',
        test: TUFFEX_UI_CORE_PATTERN,
        minSize: 0,
        priority: 20,
        includeDependenciesRecursively: false,
      },
      {
        name: 'tuffex-ui-form',
        test: TUFFEX_UI_FORM_PATTERN,
        minSize: 0,
        priority: 20,
        includeDependenciesRecursively: false,
      },
      {
        name: 'tuffex-ui-nav',
        test: TUFFEX_UI_NAV_PATTERN,
        minSize: 0,
        priority: 20,
        includeDependenciesRecursively: false,
      },
      {
        name: 'tuffex-ui-motion',
        test: TUFFEX_UI_MOTION_PATTERN,
        minSize: 0,
        priority: 20,
        includeDependenciesRecursively: false,
      },
    ],
  }
}

export function resolveTuffWebManualChunk(id: string): string | undefined {
  const cleanId = (id.split('?')[0] ?? id).replace(/\\/g, '/')
  const isStyleAsset = cleanId.endsWith('.css') || id.includes('type=style')

  if (isStyleAsset)
    return undefined

  if (NAV_EN_PATTERN.test(cleanId))
    return 'tuff-web-nav-en'
  if (NAV_ZH_PATTERN.test(cleanId))
    return 'tuff-web-nav-zh'

  return undefined
}
