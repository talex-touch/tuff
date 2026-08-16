// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

export type SidebarNavValue = string | number

export interface SidebarNavItemAction {
  /** Accessible name for the trailing quick action, e.g. `Add supplier`. */
  label: string
}

export interface SidebarNavItem {
  value: SidebarNavValue
  label: string
  /** Matches a `SidebarNavGroup.key`. Ungrouped items lead the list. */
  group?: string
  /** Icon class, e.g. `i-carbon-home`. The `item-icon` slot wins over it. */
  icon?: string
  /** Count capsule. Changing it replays the pop-in. */
  badge?: string | number
  /** Trailing quick action, revealed on hover/focus and on the active row. */
  action?: SidebarNavItemAction
  disabled?: boolean
}

export interface SidebarNavGroup {
  key: string
  /** Rendered uppercase by CSS — pass it in normal case. */
  label: string
}

export interface SidebarNavWorkspace {
  name: string
  description?: string
  /** Short code for the plate, e.g. `C`. Defaults to the first character. */
  initials?: string
}

export interface SidebarNavProps {
  items: SidebarNavItem[]
  groups?: SidebarNavGroup[]
  /** Active item value (`v-model`). */
  modelValue?: SidebarNavValue
  /** Quick-search text (`v-model:query`). */
  query?: string
  /** Omit to drop the workspace switcher. */
  workspace?: SidebarNavWorkspace
  /** Accessible name for the switcher button. @default 'Switch workspace' */
  workspaceLabel?: string
  /** Omit to drop the quick-search row. */
  searchPlaceholder?: string
  /** Accessible name for the search field; falls back to the placeholder. */
  searchLabel?: string
  /** Shortcut glyph shown at the end of the search row, e.g. `/`. */
  searchHint?: string
  /** Omit to drop the primary action button. */
  actionLabel?: string
  /**
   * Replaces the built-in match. The default is a case-insensitive `includes`
   * on the label — upstream renders the field but never filters with it.
   * Pass `items => items` when the host resolves results remotely.
   */
  filter?: (items: SidebarNavItem[], query: string) => SidebarNavItem[]
  /** Accessible name for the nav landmark. @default 'Workspace' */
  ariaLabel?: string
  /** Travel time for the floating highlight, in ms. @default 220 */
  indicatorDuration?: number
}

export interface SidebarNavEmits {
  (e: 'update:modelValue', value: SidebarNavValue): void
  (e: 'update:query', value: string): void
  /** A navigation item was activated. */
  (e: 'select', item: SidebarNavItem): void
  /** The primary action button was pressed. */
  (e: 'action'): void
  /** An item's trailing quick action was pressed. */
  (e: 'itemAction', item: SidebarNavItem): void
  /** The workspace switcher was pressed. */
  (e: 'workspaceClick'): void
}
