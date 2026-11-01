/**
 * Icon classes of OmniPanel's built-in features, for the UnoCSS safelist in `uno.config.ts`.
 *
 * Main declares each feature's icon as a class in
 * `main/modules/omni-panel/omni-panel-builtin-features.ts`, and the panel's tiles draw it as given.
 * UnoCSS extracts classes from `.vue` sources but never from `.ts` modules, so a class is generated
 * only if a template elsewhere happens to name it or it is listed here; otherwise the tile draws an
 * empty box, as AI Translate, AI Explain, AI Review and Search in CoreBox did.
 *
 * A literal list, because the config loader cannot evaluate main-process modules: nothing here
 * may import anything. `omni-panel-builtin-icons.test.ts` fails when a built-in feature declares an
 * icon missing here, or one the installed Remix Icon set does not have.
 */
export const OMNI_PANEL_BUILTIN_ICON_CLASSES: readonly string[] = Object.freeze([
  'i-ri-translate-2',
  'i-ri-translate',
  'i-ri-file-list-3-line',
  'i-ri-edit-2-line',
  'i-ri-question-answer-line',
  'i-ri-git-pull-request-line',
  'i-ri-search-line',
  'i-ri-command-line',
  'i-ri-file-copy-line'
])
