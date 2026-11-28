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

/**
 * Strictly non-recursive, acyclic DAG buckets for `/packages/tuffex/dist/es/` (`includeDependenciesRecursively: false`).
 *
 * Layering guarantees zero cross-suite chunk cascades and zero barrel pull-ins (`base`, `pro`, `ai`
 * barrel directories are intentionally excluded):
 * - Layer 0 (`tuffex-primitives`): self-contained utilities + base primitives (`button`, `icon`,
 *   `popover`, `tooltip`, `card`, `liquid`, `glass-surface`, `text-morph`, etc.). Zero outgoing
 *   TuffEx edges — single-component pages like `/en/button` load ONLY Layer 0.
 * - Layer 1 (`tuffex-ui-core`): general/layout/feedback/state components whose edges point ONLY
 *   into Layer 0.
 * - Layer 2 (`tuffex-ui-form` & `tuffex-ui-nav`): Base Suite forms, overlays, navigation, and
 *   base data-display components. Zero outgoing edges to Pro, Motion, AI, or Charts.
 * - Layer 3 (`tuffex-ui-pro`, `tuffex-ui-motion`, `tuffex-ui-ai`): independent leaf suite buckets
 *   that ONLY depend downward on Layers 0–2, never on each other or on heavy specialized widgets
 *   (`charts`, `spark-chart`, `motion-metric`, `code-editor`, `markdown-editor`, `markdown-view`,
 *   `stream-markdown`, `terminal`, `flowchart`, `image-generation`, `carousel-3d`, `shiki-runtime`).
 */
const TUFFEX_PRIMITIVES_PATTERN = /\/packages\/tuffex\/dist\/es\/(?:utils|base-anchor|base-surface|floating|button|icon|spinner|tooltip|popover|card|liquid|glass-surface|flow-light|text-morph|text-transformer|edge-fade-mask|icon-morph|auto-sizer|stagger)\//
const TUFFEX_UI_CORE_PATTERN = /\/packages\/tuffex\/dist\/es\/(?:badge|blank-slate|card-item|collapse|container|divider|dot-indicator|empty|empty-state|error-state|flex|grid|guide-state|icon-chip|kbd|layout-skeleton|loading-overlay|loading-state|no-data|no-selection|offline-state|permission-state|progress|progress-bar|scroll|search-empty|skeleton|splitter|stack|stat-card|status-badge|status-hint|tag|text|toast|toast-panel|version-capsule)\//
const TUFFEX_UI_FORM_PATTERN = /\/packages\/tuffex\/dist\/es\/(?:avatar|cascader|checkbox|choice-card|date-picker|drawer-form|file-uploader|filter-chips|flat-radio|flat-select|form|group-block|icon-picker|image-uploader|input|modal-form|number-input|picker|radio|rating|scrub-field|search-input|search-select|segmented-slider|select|sensitive-input|slider|steps-form|switch|tag-input|textarea|transfer|tree-select)\//
const TUFFEX_UI_NAV_PATTERN = /\/packages\/tuffex\/dist\/es\/(?:alert|breadcrumb|cell-link|command-palette|context-menu|corner-overlay|data-table|descriptions|dialog|drawer|dropdown-menu|flat-dropdown|grid-layout|modal|nav-bar|pagination|search-panel|selection-actions|sidebar-nav|sortable-list|steps|tab-bar|tabs|timeline|tree)\//
const TUFFEX_UI_PRO_PATTERN = /\/packages\/tuffex\/dist\/es\/(?:allocation-bar|diff-table|fine-tune-card|fusion|fusion-surface|image-gallery|image-preview|mode-chip|outline-border|resize-box|signal-meter|touch-surface|virtual-list)\//
const TUFFEX_UI_MOTION_PATTERN = /\/packages\/tuffex\/dist\/es\/(?:border-beam|card-spread|distortion-wave|flip-book|flip-overlay|fold-page|glow-text|gradient-border|gradual-blur|keyframe-stroke-text|metal-fx|morph|motion|motion-button|motion-control|motion-dock|motion-form|motion-loader|motion-transition|physics-motion|pixel-field|prism-glow|transition|tuff-logo-stroke|voice-ring)\//
const TUFFEX_UI_AI_PATTERN = /\/packages\/tuffex\/dist\/es\/(?:agent-screen|agent-trace|agents|approval-card|attachment-tray|bot-avatar|chain-of-thought|code-stream|context-cards|context-indicator|conversation-stream|inline-citation|insight-cards|message-actions|miko|prompt-bar|reasoning-disclosure|sources|stream-element|stream-text|suggestion-chips|task-rows|thinking-orb|tool-call-card|tool-chips|tool-confirmation|voice-beam|voice-clip|working-indicator)\//

export const DEFAULT_ROLLDOWN_MIN_SIZE = 16384
export const DEFAULT_INLINE_COMMON_CHUNKS_MAX_SIZE = 6144

export interface TuffexCodeSplittingGroup {
  name: string
  test: RegExp
  minSize?: number
  priority?: number
  includeDependenciesRecursively: false
}

export interface TuffexCodeSplittingConfig {
  minSize: number
  includeDependenciesRecursively: false
  groups: TuffexCodeSplittingGroup[]
  experimentalInlineCommonChunks?: {
    maxSize: number
  }
}

/**
 * Rolldown-safe `output.codeSplitting` strategy for Vite 8 + VitePress-style `.mdc → Vue SFC` SSG:
 * - Sets `includeDependenciesRecursively: false` globally and on every group so Rolldown NEVER
 *   pulls transitive `node_modules` / Vue CJS helpers into shared UI chunks.
 * - Keeps explicit groups strictly limited to:
 *   1. `tuffex-nav-en` & `tuffex-nav-zh`: pure zero-import generated locale nav modules.
 *   2. `nuxt-vue-core`: strictly eager Vue/Router/Unhead/i18n/Nuxt utility packages already on `entry.js`.
 *   3. `tuffex-primitives` & `tuffex-ui-{core,form,nav,pro,motion,ai}`: strictly acyclic,
 *      barrel-free `/packages/tuffex/dist/es/` UI component + CSS buckets.
 * - NEVER creates `tuffex-wc-*`, `demo-*`, or third-party `vendor-*` groups (`three`, `echarts`,
 *   `mermaid`, `react`) and excludes heavy specialized widgets (`charts`, `spark-chart`,
 *   `motion-metric`, `code-editor`, `markdown-editor`, `markdown-view`, `stream-markdown`,
 *   `terminal`, `flowchart`, `image-generation`, `carousel-3d`).
 */
export function createTuffexCodeSplittingConfig(
  minSize = DEFAULT_ROLLDOWN_MIN_SIZE,
): TuffexCodeSplittingConfig {
  return {
    minSize,
    includeDependenciesRecursively: false,
    experimentalInlineCommonChunks: {
      maxSize: DEFAULT_INLINE_COMMON_CHUNKS_MAX_SIZE,
    },
    groups: [
      {
        name: 'tuffex-nav-en',
        test: NAV_EN_PATTERN,
        minSize: 0,
        priority: 40,
        includeDependenciesRecursively: false,
      },
      {
        name: 'tuffex-nav-zh',
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
        name: 'tuffex-ui-pro',
        test: TUFFEX_UI_PRO_PATTERN,
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
      {
        name: 'tuffex-ui-ai',
        test: TUFFEX_UI_AI_PATTERN,
        minSize: 0,
        priority: 20,
        includeDependenciesRecursively: false,
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
