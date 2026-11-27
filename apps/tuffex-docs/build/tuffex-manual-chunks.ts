const NAV_EN_PATTERN = /tuffex-docs-nav-en\.mjs$/
const NAV_ZH_PATTERN = /tuffex-docs-nav-zh\.mjs$/

/**
 * Strictly eager core runtime packages that are ALWAYS statically imported by `entry.js`
 * on every page (Vue 3, Vue Router, Unhead, Vue i18n, Nuxt core utilities, and Vite's
 * 84-byte `plugin-vue:export-helper`). Grouping ONLY these eager packages eliminates
 * ~12 tiny 0.03–8 KiB core micro-chunks without adding a single unused byte to initial
 * load or ever pulling lazy libs (`tuffex-wc`, `mermaid`, `three`, `echarts`, `react`,
 * `demo-*`, or unused TuffEx component utils) into `entry.js`.
 */
const NUXT_VUE_CORE_PATTERN = /(?:\/node_modules\/(?:@vue\/|vue\/|vue-router\/|@unhead\/|unhead\/|ufo\/|ohash\/|defu\/|klona\/|cookie-es\/|destr\/|hookable\/|perfect-debounce\/|devalue\/|scule\/|@intlify\/|vue-i18n\/)|plugin-vue:export-helper)/

export const DEFAULT_ROLLDOWN_MIN_SIZE = 16384
export const DEFAULT_INLINE_COMMON_CHUNKS_MAX_SIZE = 6144

export interface TuffexCodeSplittingGroup {
  name: string
  test: RegExp
  minSize?: number
  priority?: number
}

export interface TuffexCodeSplittingConfig {
  minSize: number
  groups: TuffexCodeSplittingGroup[]
  experimentalInlineCommonChunks?: {
    maxSize: number
  }
}

/**
 * Rolldown-safe `output.codeSplitting` strategy for Vite 8 + VitePress-style `.mdc → Vue SFC` SSG:
 * - Sets `minSize: 16384` + `experimentalInlineCommonChunks: { maxSize: 6144 }` to eliminate
 *   dozens of tiny 0.03–6 KiB JS micro-chunks without inflating initial transfer size.
 * - Keeps explicit groups strictly limited to:
 *   1. `tuffex-nav-en` & `tuffex-nav-zh`: pure zero-import generated locale nav modules (`minSize: 0`).
 *   2. `nuxt-vue-core`: strictly eager Vue/Router/Unhead/i18n/Nuxt utility packages already on `entry.js`.
 * - NEVER creates `tuffex-wc-*`, `demo-*`, `tuffex-utils`, or third-party `vendor-*` groups so
 *   Rolldown never hoists shared Vue/CJS runtime helpers into lazy chunks or drags unused utils
 *   into initial page load.
 */
export function createTuffexCodeSplittingConfig(
  minSize = DEFAULT_ROLLDOWN_MIN_SIZE,
): TuffexCodeSplittingConfig {
  return {
    minSize,
    experimentalInlineCommonChunks: {
      maxSize: DEFAULT_INLINE_COMMON_CHUNKS_MAX_SIZE,
    },
    groups: [
      {
        name: 'tuffex-nav-en',
        test: NAV_EN_PATTERN,
        minSize: 0,
        priority: 30,
      },
      {
        name: 'tuffex-nav-zh',
        test: NAV_ZH_PATTERN,
        minSize: 0,
        priority: 30,
      },
      {
        name: 'nuxt-vue-core',
        test: NUXT_VUE_CORE_PATTERN,
        minSize: 0,
        priority: 20,
      },
    ],
  }
}

/**
 * Legacy helper retained for unit-level verification of pure nav-only chunk matching.
 */
export function resolveTuffexManualChunk(id: string): string | undefined {
  const cleanId = (id.split('?')[0] ?? id).replace(/\\/g, '/')
  const isStyleAsset = cleanId.endsWith('.css') || id.includes('type=style')

  if (isStyleAsset)
    return undefined

  if (NAV_EN_PATTERN.test(cleanId))
    return 'tuffex-nav-en'
  if (NAV_ZH_PATTERN.test(cleanId))
    return 'tuffex-nav-zh'

  return undefined
}
