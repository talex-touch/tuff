/**
 * The design concepts handbook, `content/docs/concepts/`.
 *
 * It lives beside the component docs and belongs to the Concepts suite: the
 * components sidebar lists it, and the docs page's pager walks it. Its pages
 * carry no `category`, so the grouping lives here, following the handbook's own
 * index; shared so the sidebar groups and the pager order cannot drift apart.
 *
 * Paths here are locale-neutral baseURL-relative stems (`/concepts`, `/concepts/<slug>`);
 * prefix with `/{locale}` for `<NuxtLink>` routes (Nuxt prepends `app.baseURL: '/tuffex/'`).
 */

export const CONCEPTS_MANUAL_PATH = '/concepts'

/** The domains of the handbook's index; `key` names `docsSidebar.conceptGroups.*`. */
export const CONCEPTS_MANUAL_GROUPS: { key: string, pages: string[] }[] = [
  { key: 'system', pages: ['tds'] },
  { key: 'geometry', pages: ['curvature', 'concentricity', 'depth-topology'] },
  { key: 'surfaces', pages: ['surface-taxonomy', 'refraction-physics', 'surface-deduction', 'noise-and-specular'] },
  { key: 'color', pages: ['dark-palette', 'irradiation-tuning', 'color-mix-contrast', 'light-modes'] },
  { key: 'typography', pages: ['type-scale', 'smart-wrapping'] },
  { key: 'motion', pages: ['micro-motion', 'activation-and-springs', 'compositor-and-replay'] },
  { key: 'ai', pages: ['stream-pacer', 'anti-jitter-reserve'] },
]

/** Normalized baseURL-relative page paths in reading order: the index, then each group's pages. */
export const CONCEPTS_MANUAL_READING_ORDER: string[] = [
  CONCEPTS_MANUAL_PATH,
  ...CONCEPTS_MANUAL_GROUPS.flatMap(group => group.pages.map(slug => `${CONCEPTS_MANUAL_PATH}/${slug}`)),
]

export function toLocalizedConceptPath(slug: string | null | undefined, locale: 'en' | 'zh' = 'en'): string {
  const clean = (slug ?? '').trim().replace(/^\/+|\/+$/g, '')
  if (!clean || clean === 'index')
    return `/${locale}${CONCEPTS_MANUAL_PATH}`
  return `/${locale}${CONCEPTS_MANUAL_PATH}/${clean}`
}

export function isConceptsManualPath(path: string | null | undefined): boolean {
  if (!path)
    return false
  const normalized = path
    .split(/[?#]/, 1)[0]!
    .replace(/^\/tuffex(?=\/|$)/i, '')
    .replace(/^\/(en|zh)(?=\/|$)/i, '')
    .replace(/\.(en|zh)(\.mdc?)?$/i, '')
    .replace(/\/+$/, '')

  return (
    normalized === CONCEPTS_MANUAL_PATH
    || normalized.startsWith(`${CONCEPTS_MANUAL_PATH}/`)
    || normalized === '/docs/dev/concepts'
    || normalized.startsWith('/docs/dev/concepts/')
  )
}
