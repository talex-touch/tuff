/**
 * Component-docs suite taxonomy for standalone `apps/tuffex-docs`.
 *
 * The `category` frontmatter value on every doc under `content/docs/components/`
 * is the source of truth for which group a page belongs to; this module maps
 * those values onto the eight suites and fixes the order groups render in.
 *
 * Route paths in `apps/tuffex-docs` are baseURL-relative (`/{locale}/<slug>`,
 * `/{locale}/concepts/<slug>`, `/{locale}/composition`) since `app.baseURL = '/tuffex/'`.
 */

export type DocsSuiteKey = 'concepts' | 'templates' | 'base' | 'pro' | 'ai' | 'data' | 'flow' | 'motion'

export const DOCS_SUITE_KEYS: DocsSuiteKey[] = ['concepts', 'templates', 'base', 'pro', 'ai', 'data', 'flow', 'motion']

/**
 * Ordered `category` frontmatter values per suite.
 *
 * `concepts` is intentionally empty: its pages (the components index, which
 * doubles as the Concepts overview, plus foundations and utils) render as
 * standalone links rather than category groups.
 */
export const SUITE_CATEGORY_KEYS: Record<DocsSuiteKey, string[]> = {
  concepts: [],
  templates: ['TemplateApp', 'TemplateContent', 'TemplateAi', 'TemplateData'],
  base: ['Basic', 'Form', 'Layout', 'Navigation', 'Data', 'Feedback', 'Status'],
  pro: ['Advanced', 'Effects', 'Primitives'],
  ai: ['AiChat', 'AiAgent', 'AiReasoning', 'AiContext'],
  data: ['Charts', 'Visualization'],
  flow: ['Flow'],
  motion: ['MotionButtons', 'MotionCards', 'MotionCarousels', 'MotionLoaders', 'MotionCharts', 'MotionText', 'MotionPhysics', 'MotionInteraction', 'MotionToggles', 'MotionTransitions'],
}

/**
 * Every `category` value, including the `*Suite` values the overview pages
 * themselves carry, mapped onto its owning suite.
 */
export const CATEGORY_SUITE_MAP: Record<string, DocsSuiteKey> = {
  Foundations: 'concepts',
  TemplateApp: 'templates',
  TemplateContent: 'templates',
  TemplateAi: 'templates',
  TemplateData: 'templates',
  BaseSuite: 'base',
  Basic: 'base',
  Form: 'base',
  Layout: 'base',
  Navigation: 'base',
  Data: 'base',
  Feedback: 'base',
  Status: 'base',
  ProSuite: 'pro',
  Advanced: 'pro',
  Effects: 'pro',
  Primitives: 'pro',
  Visualization: 'data',
  Charts: 'data',
  DataSuite: 'data',
  AiSuite: 'ai',
  AiChat: 'ai',
  AiAgent: 'ai',
  AiReasoning: 'ai',
  AiContext: 'ai',
  FlowSuite: 'flow',
  Flow: 'flow',
  MotionSuite: 'motion',
  MotionButtons: 'motion',
  MotionCards: 'motion',
  MotionCarousels: 'motion',
  MotionLoaders: 'motion',
  MotionCharts: 'motion',
  MotionText: 'motion',
  MotionPhysics: 'motion',
  MotionInteraction: 'motion',
  MotionToggles: 'motion',
  MotionTransitions: 'motion',
}

/** Category value -> the `docsSidebar.categories.*` i18n key that labels it. */
export const CATEGORY_I18N_KEY: Record<string, string> = {
  TemplateApp: 'templateApp',
  TemplateContent: 'templateContent',
  TemplateAi: 'templateAi',
  TemplateData: 'templateData',
  Basic: 'basic',
  Form: 'form',
  Layout: 'layout',
  Navigation: 'navigation',
  Data: 'data',
  Feedback: 'feedback',
  Status: 'status',
  Advanced: 'advanced',
  Effects: 'effects',
  Primitives: 'primitives',
  Charts: 'charts',
  Visualization: 'visualization',
  AiChat: 'aiChat',
  AiAgent: 'aiAgent',
  AiReasoning: 'aiReasoning',
  AiContext: 'aiContext',
  Flow: 'flow',
  MotionButtons: 'motionButtons',
  MotionCards: 'motionCards',
  MotionCarousels: 'motionCarousels',
  MotionLoaders: 'motionLoaders',
  MotionCharts: 'motionCharts',
  MotionText: 'motionText',
  MotionPhysics: 'motionPhysics',
  MotionInteraction: 'motionInteraction',
  MotionToggles: 'motionToggles',
  MotionTransitions: 'motionTransitions',
}

/** The `docsSidebar.categories.*` key for a category, falling back to `misc`. */
export function categoryI18nKey(category: string): string {
  return CATEGORY_I18N_KEY[category] ?? 'misc'
}

/**
 * Static mapping from normalized TuffEx doc path (`/<slug>`, `/concepts`, `/composition`)
 * to its owning suite.
 *
 * Used for SSR and initial client render so the sidebar suite never flickers.
 */
export const STATIC_COMPONENT_SUITE_MAP: Record<string, DocsSuiteKey> = {
  '/accessibility': 'concepts',
  '/agent-screen': 'ai',
  '/agent-trace': 'ai',
  '/agents': 'ai',
  '/ai-elements': 'ai',
  '/ai-suite': 'ai',
  '/alert': 'base',
  '/allocation-bar': 'data',
  '/approval-card': 'ai',
  '/attachment-tray': 'ai',
  '/auto-sizer': 'pro',
  '/avatar': 'base',
  '/avatar-variants': 'base',
  '/badge': 'base',
  '/base-anchor': 'pro',
  '/base-suite': 'base',
  '/base-surface': 'pro',
  '/blank-slate': 'base',
  '/border-beam': 'pro',
  '/bot-avatar': 'ai',
  '/breadcrumb': 'base',
  '/button': 'base',
  '/card': 'base',
  '/card-item': 'base',
  '/card-spread': 'motion',
  '/carousel-3d': 'motion',
  '/cascader': 'base',
  '/cell-link': 'base',
  '/chain-of-thought': 'ai',
  '/changelog': 'concepts',
  '/chart-colors': 'data',
  '/charts': 'data',
  '/chat': 'ai',
  '/chat-composer': 'ai',
  '/checkbox': 'base',
  '/choice-card': 'ai',
  '/code-editor': 'pro',
  '/code-stream': 'ai',
  '/collapse': 'base',
  '/command-palette': 'pro',
  '/composition': 'concepts',
  '/concepts': 'concepts',
  '/container': 'base',
  '/context-cards': 'ai',
  '/context-indicator': 'ai',
  '/context-menu': 'base',
  '/conversation-stream': 'ai',
  '/corner-overlay': 'pro',
  '/custom-chart': 'data',
  '/data-suite': 'data',
  '/data-table': 'base',
  '/date-picker': 'base',
  '/descriptions': 'base',
  '/device-mockup': 'pro',
  '/dialog': 'base',
  '/diff-table': 'data',
  '/distortion-wave': 'motion',
  '/dither-chart': 'motion',
  '/divider': 'base',
  '/dot-indicator': 'base',
  '/drawer': 'base',
  '/drawer-form': 'base',
  '/dropdown-menu': 'base',
  '/echart-charts': 'data',
  '/edge-fade-mask': 'pro',
  '/empty': 'base',
  '/empty-state': 'base',
  '/error-state': 'base',
  '/file-uploader': 'base',
  '/filter-chips': 'base',
  '/fine-tune-card': 'ai',
  '/flat-dropdown': 'base',
  '/flat-radio': 'base',
  '/flat-select': 'base',
  '/flex': 'base',
  '/flip-book': 'motion',
  '/flip-overlay': 'pro',
  '/fold-page': 'pro',
  '/floating': 'pro',
  '/flow-light': 'pro',
  '/flow-suite': 'flow',
  '/flowchart': 'flow',
  '/form': 'base',
  '/foundations': 'concepts',
  '/fusion': 'pro',
  '/fusion-surface': 'pro',
  '/glass-surface': 'pro',
  '/glow-text': 'pro',
  '/gradient-border': 'pro',
  '/gradual-blur': 'pro',
  '/grid': 'base',
  '/grid-layout': 'base',
  '/group-block': 'base',
  '/guide-state': 'base',
  '/icon': 'base',
  '/icon-chip': 'base',
  '/icon-morph': 'pro',
  '/icon-picker': 'base',
  '/icons': 'concepts',
  '/image-gallery': 'base',
  '/image-generation': 'pro',
  '/image-preview': 'base',
  '/image-uploader': 'base',
  '/index': 'concepts',
  '/inline-citation': 'ai',
  '/input': 'base',
  '/insight-cards': 'ai',
  '/installation': 'concepts',
  '/kbd': 'base',
  '/keyframe-stroke-text': 'pro',
  '/layout-skeleton': 'base',
  '/learning-curve': 'data',
  '/liquid': 'pro',
  '/loading-overlay': 'base',
  '/loading-state': 'base',
  '/maps': 'data',
  '/markdown-editor': 'pro',
  '/markdown-view': 'base',
  '/matrix-loader': 'ai',
  '/message-actions': 'ai',
  '/metal-fx': 'pro',
  '/miko': 'ai',
  '/modal': 'base',
  '/modal-form': 'base',
  '/mode-chip': 'ai',
  '/mono-chart': 'data',
  '/morph': 'pro',
  '/motion': 'motion',
  '/motion-button': 'motion',
  '/motion-control': 'pro',
  '/motion-dock': 'motion',
  '/motion-form': 'pro',
  '/motion-loader': 'motion',
  '/motion-metric': 'pro',
  '/motion-suite': 'motion',
  '/motion-text': 'motion',
  '/motion-toggle': 'motion',
  '/motion-transition': 'motion',
  '/nav-bar': 'base',
  '/no-data': 'base',
  '/no-selection': 'base',
  '/number-input': 'base',
  '/offline-state': 'base',
  '/outline-border': 'pro',
  '/pagination': 'base',
  '/permission-state': 'base',
  '/physics-motion': 'motion',
  '/picker': 'base',
  '/pixel-field': 'motion',
  '/popover': 'base',
  '/prism-glow': 'pro',
  '/pro-suite': 'pro',
  '/progress': 'base',
  '/progress-bar': 'base',
  '/prompt-bar': 'ai',
  '/radio': 'base',
  '/rating': 'base',
  '/reasoning-disclosure': 'ai',
  '/recommendation-card': 'ai',
  '/resize-box': 'pro',
  '/sankey-chart': 'data',
  '/scroll': 'base',
  '/scrub-field': 'base',
  '/search-empty': 'base',
  '/search-input': 'base',
  '/search-panel': 'pro',
  '/search-select': 'base',
  '/segmented-slider': 'base',
  '/select': 'base',
  '/selection-actions': 'base',
  '/sensitive-input': 'base',
  '/sidebar-nav': 'base',
  '/signal-meter': 'data',
  '/skeleton': 'base',
  '/slider': 'base',
  '/sortable-list': 'base',
  '/sound': 'concepts',
  '/sources': 'ai',
  '/spark-chart': 'data',
  '/spinner': 'base',
  '/splitter': 'base',
  '/stack': 'base',
  '/stagger': 'pro',
  '/stat-card': 'base',
  '/status-badge': 'base',
  '/status-hint': 'base',
  '/steps': 'base',
  '/steps-form': 'base',
  '/stream-element': 'ai',
  '/stream-markdown': 'ai',
  '/stream-text': 'ai',
  '/suggestion-chips': 'ai',
  '/switch': 'base',
  '/tab-bar': 'base',
  '/tabs': 'base',
  '/tag': 'base',
  '/tag-input': 'base',
  '/task-rows': 'ai',
  '/template-account': 'templates',
  '/template-agent-chat': 'templates',
  '/template-ai-answer': 'templates',
  '/template-automation': 'templates',
  '/template-cms': 'templates',
  '/template-dashboard': 'templates',
  '/template-docs': 'templates',
  '/template-experiments': 'templates',
  '/template-files': 'templates',
  '/template-gallery': 'templates',
  '/template-image-studio': 'templates',
  '/template-inbox': 'templates',
  '/template-kanban': 'templates',
  '/template-launcher': 'templates',
  '/template-notes': 'templates',
  '/template-onboarding': 'templates',
  '/template-release': 'templates',
  '/template-research': 'templates',
  '/template-search': 'templates',
  '/template-settings': 'templates',
  '/template-shell': 'templates',
  '/template-showcase': 'templates',
  '/template-store': 'templates',
  '/template-voice': 'templates',
  '/template-workbench': 'templates',
  '/terminal': 'pro',
  '/text': 'base',
  '/text-morph': 'pro',
  '/text-transformer': 'pro',
  '/textarea': 'base',
  '/theming': 'concepts',
  '/thinking-orb': 'ai',
  '/timeline': 'base',
  '/timeseries-chart': 'data',
  '/toast': 'base',
  '/toast-panel': 'base',
  '/tool-call-card': 'ai',
  '/tool-chips': 'ai',
  '/tool-confirmation': 'ai',
  '/tooltip': 'base',
  '/touch-surface': 'pro',
  '/transfer': 'base',
  '/transition': 'pro',
  '/tree': 'base',
  '/tree-select': 'base',
  '/tuff-logo-stroke': 'pro',
  '/typing-indicator': 'ai',
  '/utils': 'concepts',
  '/version-capsule': 'pro',
  '/virtual-list': 'pro',
  '/voice-beam': 'pro',
  '/voice-clip': 'ai',
  '/voice-ring': 'motion',
  '/working-indicator': 'ai',
}

/**
 * Resolves a route path (`/{locale}/<slug>`, `/tuffex/{locale}/<slug>`, `/<slug>`,
 * `/{locale}/concepts/<slug>`, or legacy `/docs/dev/components/<slug>`) to its suite key.
 */
export function resolveStaticComponentSuite(path: string): DocsSuiteKey | null {
  if (!path)
    return null

  let normalized = path
    .split(/[?#]/, 1)[0]!
    .replace(/^\/tuffex(?=\/|$)/i, '')
    .replace(/^\/(zh|en)(?=\/|$)/i, '')
    .replace(/\.(zh|en)(\.mdc?)?$/i, '')
    .replace(/\/+$/, '')

  if (!normalized || normalized === '/')
    return 'concepts'

  if (normalized === '/concepts' || normalized.startsWith('/concepts/'))
    return 'concepts'

  if (normalized === '/docs/dev/concepts' || normalized.startsWith('/docs/dev/concepts/'))
    return 'concepts'

  if (normalized === '/docs/dev/getting-started/tuffex-composition')
    return 'concepts'

  normalized = normalized
    .replace(/^\/docs\/dev\/components(?=\/|$)/i, '')
    .replace(/^\/(?:docs\/)?components(?=\/|$)/i, '')

  if (!normalized || normalized === '/')
    return 'concepts'

  return STATIC_COMPONENT_SUITE_MAP[normalized] ?? null
}
