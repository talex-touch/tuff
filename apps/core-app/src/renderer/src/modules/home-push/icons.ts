/**
 * Every icon the Home push cards draw: the guide's categories and starter tasks, and the kinds of
 * item 「为你准备」 lists.
 *
 * Nothing here may import anything — not Vue, not the renderer's `~` alias, not a sibling module:
 * `uno.config.ts` reads `HOME_PUSH_ICON_CLASSES` to build its safelist, and the config loader can
 * evaluate a plain table but not the renderer's module graph. UnoCSS never scans `.ts` files, so a
 * class that lives only in these tables would otherwise ship without CSS and every card row would
 * draw an empty box.
 */

/** The five guide categories, one glyph each. */
export const HOME_GUIDE_CATEGORY_ICONS = {
  work: 'i-ri-briefcase-4-line',
  files: 'i-ri-folder-3-line',
  writing: 'i-ri-quill-pen-line',
  research: 'i-ri-bar-chart-box-line',
  automation: 'i-ri-flashlight-line'
} as const

/** Starter tasks on the guide's second page, keyed by `<category>.<task>`. */
export const HOME_GUIDE_STARTER_ICONS = {
  'work.progress': 'i-ri-git-commit-line',
  'work.breakdown': 'i-ri-list-check-3',
  'work.plan': 'i-ri-calendar-todo-line',
  'work.notes': 'i-ri-task-line',
  'files.find': 'i-ri-file-search-line',
  'files.downloads': 'i-ri-folder-received-line',
  'files.projectTour': 'i-ri-node-tree',
  'files.summarize': 'i-ri-file-text-line',
  'writing.email': 'i-ri-mail-send-line',
  'writing.polish': 'i-ri-magic-line',
  'writing.translate': 'i-ri-translate-2',
  'research.summarize': 'i-ri-article-line',
  'research.chart': 'i-ri-line-chart-line',
  'research.projectStructure': 'i-ri-mind-map',
  'research.compare': 'i-ri-scales-3-line',
  'automation.script': 'i-ri-terminal-box-line',
  'automation.rename': 'i-ri-file-edit-line',
  'automation.repeat': 'i-ri-repeat-line'
} as const

/** 「我自己说」: the way out of the guide, into the composer. */
export const HOME_GUIDE_SELF_ICON = 'i-ri-chat-new-line'

/** The kinds of item 「为你准备」 can list. */
export const HOME_FEED_ICONS = {
  conversation: 'i-ri-chat-history-line',
  session: 'i-ri-terminal-line',
  clipboard: 'i-ri-clipboard-line',
  project: 'i-ri-folder-open-line'
} as const

/**
 * Every class above, de-duplicated, for the UnoCSS safelist. Derived from the tables so the
 * safelist cannot drift from what the cards render.
 */
export const HOME_PUSH_ICON_CLASSES: readonly string[] = Object.freeze(
  Array.from(
    new Set<string>([
      ...Object.values(HOME_GUIDE_CATEGORY_ICONS),
      ...Object.values(HOME_GUIDE_STARTER_ICONS),
      HOME_GUIDE_SELF_ICON,
      ...Object.values(HOME_FEED_ICONS)
    ])
  )
)
