/**
 * The design concepts handbook, `content/docs/dev/concepts/`.
 *
 * It lives beside the component docs but belongs to the Concepts suite: the
 * components sidebar lists it, and the docs page's pager walks it. Its pages
 * carry no `category`, so the grouping lives here, following the handbook's own
 * index; shared so the sidebar groups and the pager order cannot drift apart.
 */

export const CONCEPTS_MANUAL_PATH = '/docs/dev/concepts'

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

/** Normalized page paths in reading order: the index, then each group's pages. */
export const CONCEPTS_MANUAL_READING_ORDER: string[] = [
  CONCEPTS_MANUAL_PATH,
  ...CONCEPTS_MANUAL_GROUPS.flatMap(group => group.pages.map(slug => `${CONCEPTS_MANUAL_PATH}/${slug}`)),
]

export function isConceptsManualPath(path: string | null | undefined) {
  return Boolean(path && (path === CONCEPTS_MANUAL_PATH || path.startsWith(`${CONCEPTS_MANUAL_PATH}/`)))
}
