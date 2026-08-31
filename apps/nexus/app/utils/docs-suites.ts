/**
 * Component-docs suite taxonomy.
 *
 * The `category` frontmatter value on every doc under `content/docs/dev/components/`
 * is the source of truth for which group a component belongs to; this module maps
 * those values onto the five suites and fixes the order groups render in.
 *
 * Shared so the sidebar and the suite overview catalogs cannot drift apart. Adding
 * a category means touching all three maps here, and nothing else.
 */

export type DocsSuiteKey = 'concepts' | 'base' | 'pro' | 'ai' | 'data'

export const DOCS_SUITE_KEYS: DocsSuiteKey[] = ['concepts', 'base', 'pro', 'ai', 'data']

/**
 * Ordered `category` frontmatter values per suite.
 *
 * `concepts` is intentionally empty: its pages (concepts-suite, foundations,
 * utils) render as standalone links rather than category groups.
 */
export const SUITE_CATEGORY_KEYS: Record<DocsSuiteKey, string[]> = {
  concepts: [],
  base: ['Basic', 'Form', 'Layout', 'Navigation', 'Data', 'Feedback', 'Status'],
  pro: ['Advanced', 'Effects', 'Primitives'],
  ai: ['AiChat', 'AiAgent', 'AiReasoning', 'AiContext'],
  data: ['Charts', 'Visualization'],
}

/**
 * Every `category` value, including the `*Suite` values the overview pages
 * themselves carry, mapped onto its owning suite.
 */
export const CATEGORY_SUITE_MAP: Record<string, DocsSuiteKey> = {
  Foundations: 'concepts',
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
  AiSuite: 'ai',
  AiChat: 'ai',
  AiAgent: 'ai',
  AiReasoning: 'ai',
  AiContext: 'ai',
}

/** Category value -> the `docsSidebar.categories.*` i18n key that labels it. */
export const CATEGORY_I18N_KEY: Record<string, string> = {
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
}

/** The `docsSidebar.categories.*` key for a category, falling back to `misc`. */
export function categoryI18nKey(category: string): string {
  return CATEGORY_I18N_KEY[category] ?? 'misc'
}
