/**
 * Semantic tone of a release channel. Drives the status dot and label colour
 * across the capsule, the history rows and the notice block.
 */
export type TxVersionChannelTone = 'stable' | 'preview' | 'nightly' | 'neutral'

/** Which panel the capsule currently has open. */
export type TxVersionCapsulePanel = 'download' | 'history' | null

export interface TxVersionCapsuleProps {
  /** Version tag rendered as the headline, e.g. `'v2.4.13-beta.19'`. */
  version: string
  /** Channel label rendered next to the status dot, e.g. `'BETA'`. */
  channel?: string
  /** Semantic tone driving the dot and channel colour. Default `'preview'`. */
  tone?: TxVersionChannelTone
  /** Label for the right segment. Default `'History'`. */
  historyLabel?: string
  /** Accessible name for the left segment. Default `'Download this build'`. */
  downloadLabel?: string
  /** Controlled open panel. Omit for uncontrolled (internal) behaviour. */
  panel?: TxVersionCapsulePanel
  /** Disable both segments. */
  disabled?: boolean
  /** Close the open panel when clicking outside. Default `true`. */
  closeOnClickOutside?: boolean
  /** Close the open panel on Escape. Default `true`. */
  closeOnEsc?: boolean
}

export interface TxVersionCapsulePanelSlotProps {
  /** Close the open panel and return focus to its segment. */
  close: () => void
}

/** A single downloadable artifact for one platform/architecture. */
export interface TxVersionBuild {
  /** Stable identity used as the list key. */
  id: string
  /** Headline, e.g. `'macOS · Apple silicon'`. */
  name: string
  /** Secondary line, e.g. `'.dmg · 126 MB'`. */
  meta?: string
  /** Direct download URL. Rendered as a link when present. */
  href?: string
  /**
   * Marks the build matching the visitor's platform. The first recommended
   * build is highlighted and gets the labelled download button; the rest fall
   * back to a bare glyph.
   */
  recommended?: boolean
  /** Icon class rendered before the name — the consumer supplies the icon set. */
  icon?: string
}

/** Trust statement shown above the build list. */
export interface TxVersionNotice {
  /** `'warning'` for pre-release caveats, `'success'` for certified builds. Default `'warning'`. */
  tone?: 'warning' | 'success'
  title: string
  description?: string
  /** Bulleted caveats. Omit for a headline-only notice. */
  points?: string[]
}

export interface TxVersionDownloadPanelProps {
  /** Trust block rendered above the builds. Omit to show builds only. */
  notice?: TxVersionNotice
  builds?: TxVersionBuild[]
  /** Overline above the build list. Default `'Choose a build'`. */
  buildsLabel?: string
  /** Label on the recommended build's button. Default `'Download'`. */
  downloadLabel?: string
  /** Shown when `builds` is empty. Default `'No builds published yet.'`. */
  emptyText?: string
}

/** One release in the history list. */
export interface TxVersionHistoryEntry {
  /** Stable identity used as the list key. */
  id: string
  tag: string
  /** Channel label, e.g. `'BETA'`. */
  channel?: string
  tone?: TxVersionChannelTone
  date?: string
  /** One-line changelog summary. Only rendered for the latest entry. */
  note?: string
  href?: string
}

export interface TxVersionHistoryPanelProps {
  /** Panel heading. Default `'Version history'`. */
  title?: string
  /** Featured entry rendered as a card above the list. */
  latest?: TxVersionHistoryEntry
  entries?: TxVersionHistoryEntry[]
  /** Badge on the featured card. Default `'LATEST'`. */
  latestLabel?: string
  /** Right-hand side of the header, e.g. `'6 releases'`. */
  countLabel?: string
  /** Call-to-action on the featured card. Default `'What's new'`. */
  notesLabel?: string
  /** Shown when there is neither a `latest` nor any `entries`. */
  emptyText?: string
}
