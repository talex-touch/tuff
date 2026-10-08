/**
 * Component-docs suite taxonomy.
 *
 * The `category` frontmatter value on every doc under `content/docs/dev/components/`
 * is the source of truth for which group a page belongs to; this module maps
 * those values onto the eight suites and fixes the order groups render in.
 *
 * Shared so the sidebar and the suite overview catalogs cannot drift apart. Adding
 * a category means touching all three maps here, and nothing else.
 *
 * Note these suites are a *docs* taxonomy and do not have to line up with the
 * three component barrels (`src/{base,pro,ai}/index.ts`): the `data` suite is
 * already split across `pro` and `base`, `flow` lives in `ai`, and `motion`
 * groups existing `pro` and `charts` component entries. `templates`
 * holds no components at all: its pages are full-page compositions of the other
 * suites' components, so it has no barrel, no overview page and no gallery band.
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
