import type { MarkdownEditorMode, MarkdownEditorToolbarActionKey } from './types'

interface ToolbarEntry {
  label: string
  icon: string
}

// Carbon, which every host of this editor installs. The toolbar used to draw
// Remix icons, and Nexus — which keeps `ri` out of its dependencies on
// purpose — rendered all fourteen as grey squares on the docs page.
//
// A plain module rather than the SFC, so a host that has to safelist these
// classes can import the list instead of copying it.
export const markdownEditorActionMeta: Record<MarkdownEditorToolbarActionKey, ToolbarEntry> = {
  heading: { label: 'Heading', icon: 'i-carbon-heading' },
  bold: { label: 'Bold', icon: 'i-carbon-text-bold' },
  italic: { label: 'Italic', icon: 'i-carbon-text-italic' },
  strike: { label: 'Strike', icon: 'i-carbon-text-strikethrough' },
  quote: { label: 'Quote', icon: 'i-carbon-quotes' },
  code: { label: 'Code', icon: 'i-carbon-code' },
  bulletList: { label: 'Bullet list', icon: 'i-carbon-list-bulleted' },
  orderedList: { label: 'Ordered list', icon: 'i-carbon-list-numbered' },
  link: { label: 'Link', icon: 'i-carbon-link' },
  undo: { label: 'Undo', icon: 'i-carbon-undo' },
  redo: { label: 'Redo', icon: 'i-carbon-redo' },
}

export const markdownEditorModeMeta: Record<MarkdownEditorMode, ToolbarEntry> = {
  wysiwyg: { label: 'WYSIWYG', icon: 'i-carbon-edit' },
  source: { label: 'Markdown source', icon: 'i-carbon-code-block' },
  preview: { label: 'Preview', icon: 'i-carbon-view' },
}

/** Every icon class the toolbar can draw. */
export const MARKDOWN_EDITOR_ICON_CLASSES: string[] = [
  ...Object.values(markdownEditorActionMeta),
  ...Object.values(markdownEditorModeMeta),
].map(entry => entry.icon)
