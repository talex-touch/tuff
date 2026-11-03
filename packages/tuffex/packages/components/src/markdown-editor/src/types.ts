import type { TxEmojiPack } from '../../icon/src/emoji-pack'

export type MarkdownEditorMode = 'wysiwyg' | 'source' | 'preview'
export type MarkdownEditorTheme = 'auto' | 'light' | 'dark'

export type MarkdownEditorToolbarActionKey =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'highlight'
  | 'quote'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'link'
  | 'image'
  | 'table'
  | 'codeBlock'
  | 'math'
  | 'divider'
  | 'emoji'
  | 'undo'
  | 'redo'

/**
 * The highlighter's colors. Yellow is Markdown's `==text==`; the others are
 * `<mark data-color>`, which renderers without that syntax still show as a
 * highlight.
 */
export const MARKDOWN_EDITOR_HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const
export type MarkdownEditorHighlightColor = typeof MARKDOWN_EDITOR_HIGHLIGHT_COLORS[number]

/** GitHub's alerts: a top-level quote whose first line is `[!NOTE]`, `[!TIP]` and so on. */
export const MARKDOWN_EDITOR_CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const
export type MarkdownEditorCalloutType = typeof MARKDOWN_EDITOR_CALLOUT_TYPES[number]

/**
 * Code blocks' syntax-colour presets, each a light and a dark theme that
 * follow the editor's: GitHub, One, Vitesse, Catppuccin (Latte / Mocha) and
 * Solarized. `none` leaves code in the editor's own colours.
 */
export const MARKDOWN_EDITOR_CODE_THEMES = ['github', 'one', 'vitesse', 'catppuccin', 'solarized', 'none'] as const
export type MarkdownEditorCodeTheme = typeof MARKDOWN_EDITOR_CODE_THEMES[number]

/**
 * What the selection bar's AI menu asks for. `translate` leaves the language
 * to the handler; `custom` is the user's own instruction.
 */
export const MARKDOWN_EDITOR_AI_ACTIONS = ['improve', 'shorten', 'expand', 'fix', 'translate'] as const
export type MarkdownEditorAiAction = typeof MARKDOWN_EDITOR_AI_ACTIONS[number] | 'custom'

export interface MarkdownEditorAiRequest {
  action: MarkdownEditorAiAction
  /** What the user typed, for `custom`; empty otherwise. */
  instruction: string
  /** The selected Markdown, without the spaces around it: what the answer replaces. */
  text: string
  /** Up to 2,000 characters of the document before and after it, for context. */
  before: string
  after: string
  /** Aborted when the user stops, retries or discards. */
  signal: AbortSignal
}

/**
 * Rewrites the selected Markdown. Return the whole answer, or stream it: an
 * async iterable whose pieces are appended in turn.
 */
export type MarkdownEditorAi = (request: MarkdownEditorAiRequest) => string | Promise<string> | AsyncIterable<string>

/**
 * One replacement in the Markdown source. A change set is an array of these,
 * sorted and non-overlapping, every offset counted against the document as it
 * was *before* the set applies (CodeMirror's convention).
 */
export interface MarkdownTextChange {
  from: number
  to: number
  insert: string
}

/** A caret or range as Markdown source offsets. */
export interface MarkdownEditorSelection {
  anchor: number
  head: number
}

export interface MarkdownEditorUser {
  id: string
  name: string
  /** Any CSS colour; tints the caret, selection and avatar ring. */
  color?: string
  avatar?: string
}

export interface MarkdownEditorPeer extends MarkdownEditorUser {
  selection?: MarkdownEditorSelection | null
  mode?: MarkdownEditorMode
}

export interface MarkdownEditorPresence {
  selection: MarkdownEditorSelection | null
  mode: MarkdownEditorMode
}

export interface MarkdownEditorCollaborationHandlers {
  /** Remote edits, already rebased onto this editor's current document. */
  onChanges: (changes: MarkdownTextChange[]) => void
  /** Everyone else in the session; replaces the previous list. */
  onPeers?: (peers: MarkdownEditorPeer[]) => void
}

/**
 * Transport for real-time editing. The editor only produces and applies change
 * sets; ordering and rebasing concurrent edits (OT, CRDT, a lock) belong to the
 * adapter, which is why remote changes must arrive relative to the document the
 * editor holds at the moment they are delivered.
 */
export interface MarkdownEditorCollaboration {
  /** One local edit, relative to the document before it. */
  send: (changes: MarkdownTextChange[]) => void
  /** Local caret and mode; throttled by the editor. */
  sendPresence?: (presence: MarkdownEditorPresence) => void
  /** Start listening; returns the unsubscribe function. */
  subscribe: (handlers: MarkdownEditorCollaborationHandlers) => () => void
}

export interface MarkdownEditorCommentReply {
  id: string
  author: MarkdownEditorUser
  body: string
  /** Epoch milliseconds. */
  createdAt: number
}

/**
 * A thread anchored to `from..to` in the source. The editor keeps the offsets
 * in step with every edit, local or remote, and emits `update:comments`; when
 * a stored range no longer matches `quote`, it re-anchors on the nearest copy
 * of the quote, or shows the thread as detached.
 */
export interface MarkdownEditorComment {
  id: string
  from: number
  to: number
  quote: string
  author: MarkdownEditorUser
  body: string
  /** Epoch milliseconds. */
  createdAt: number
  resolved?: boolean
  replies?: MarkdownEditorCommentReply[]
}

export interface MarkdownEditorUploadContext {
  onProgress: (percent: number) => void
  /** Aborted when the placeholder is deleted or the editor unmounts. */
  signal: AbortSignal
}

export type MarkdownEditorUploadResult = string | { url: string, alt?: string, title?: string }

export type MarkdownEditorUploadImage = (
  file: File,
  context: MarkdownEditorUploadContext,
) => Promise<MarkdownEditorUploadResult>

export interface MarkdownEditorLabels {
  wysiwyg: string
  source: string
  preview: string
  modeGroup: string
  toolbar: string
  heading: string
  heading1: string
  heading2: string
  heading3: string
  /** The slash command menu. */
  slashMenu: string
  /** The bar over selected text. */
  selectionToolbar: string
  ai: string
  aiImprove: string
  aiShorten: string
  aiExpand: string
  aiFix: string
  aiTranslate: string
  aiPlaceholder: string
  aiSend: string
  aiWorking: string
  /** Switches the answer between the changes and the clean text. */
  aiChanges: string
  aiReplace: string
  aiInsertBelow: string
  aiRetry: string
  aiStop: string
  aiDiscard: string
  aiFailed: string
  bold: string
  italic: string
  strike: string
  code: string
  highlight: string
  /** The menu of highlighter colors. */
  highlightColors: string
  highlightYellow: string
  highlightGreen: string
  highlightBlue: string
  highlightPink: string
  highlightPurple: string
  removeHighlight: string
  quote: string
  /** Callout titles, shown in place of `[!NOTE]` and the other markers. */
  calloutNote: string
  calloutTip: string
  calloutImportant: string
  calloutWarning: string
  calloutCaution: string
  bulletList: string
  orderedList: string
  taskList: string
  link: string
  image: string
  table: string
  codeBlock: string
  math: string
  divider: string
  emoji: string
  undo: string
  redo: string
  comment: string
  comments: string
  close: string
  commentPlaceholder: string
  replyPlaceholder: string
  commentSubmit: string
  replySubmit: string
  cancel: string
  resolve: string
  reopen: string
  delete: string
  resolved: string
  noComments: string
  detached: string
  emojiSearch: string
  emojiEmpty: string
  emojiRecent: string
  emojiPeople: string
  emojiNature: string
  emojiFood: string
  emojiActivity: string
  emojiTravel: string
  emojiObjects: string
  emojiSymbols: string
  emojiFlags: string
  linkPlaceholder: string
  apply: string
  removeLink: string
  mathPlaceholder: string
  tableColumn: string
  uploading: string
  uploadFailed: string
  /** `{count}` is replaced with the number. */
  words: string
  /** `{count}` is replaced with the number. */
  characters: string
  /** `{count}` is replaced with the number. */
  peers: string
  you: string
}

export interface MarkdownEditorProps {
  modelValue?: string
  placeholder?: string
  mode?: MarkdownEditorMode
  defaultMode?: MarkdownEditorMode
  disabled?: boolean
  readonly?: boolean
  sanitize?: boolean
  theme?: MarkdownEditorTheme
  toolbar?: boolean
  toolbarActions?: MarkdownEditorToolbarActionKey[]
  minHeight?: string | number
  maxHeight?: string | number
  /** @default 'Markdown editor' */
  ariaLabel?: string
  /** Overrides the built-in link field: resolve to the URL, or '' to cancel. */
  linkPrompt?: (selectedText: string) => string | Promise<string>
  /** `$…$` and `$$…$$` through KaTeX. @default true */
  math?: boolean
  /** `:shortcode:` rendering, `:` completion and the picker. @default true */
  emoji?: boolean
  /** Custom emoji images: a tab each in the picker, and rendered for their `:name:` shortcodes. */
  emojiPacks?: readonly TxEmojiPack[]
  /** `==text==` highlights and the highlighter's colors. @default true */
  highlight?: boolean
  /** Quotes opening with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` as callouts. @default true */
  callouts?: boolean
  /** Syntax colours for code blocks with a language. @default 'github' */
  codeTheme?: MarkdownEditorCodeTheme
  /** `/` first in a paragraph of the rich text opens a menu of blocks. @default true */
  slash?: boolean
  /** A bar of formats over text selected in the rich text. @default true */
  bubble?: boolean
  /** Rewrites the selection from the bar's AI menu; leave undefined to leave AI out. */
  ai?: MarkdownEditorAi
  /** Upload pasted, dropped or picked images; resolve to the hosted URL. */
  uploadImage?: MarkdownEditorUploadImage
  /** Comment threads; leave undefined to hide the comments UI. */
  comments?: MarkdownEditorComment[]
  /**
   * Whether the comment sidebar is open, for `v-model:comments-open`; leave
   * undefined and the editor keeps it. The toolbar's comments button, a new
   * comment and a click on commented text open it either way.
   */
  commentsOpen?: boolean
  /** The local user: comment author and the identity peers see. */
  user?: MarkdownEditorUser
  collaboration?: MarkdownEditorCollaboration
  /** Word / character counts and activity. @default true */
  statusBar?: boolean
  labels?: Partial<MarkdownEditorLabels>
}

export interface MarkdownEditorEmits {
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
  (e: 'update:mode', mode: MarkdownEditorMode): void
  (e: 'mode-change', mode: MarkdownEditorMode): void
  (e: 'focus'): void
  (e: 'blur'): void
  (e: 'update:comments', comments: MarkdownEditorComment[]): void
  (e: 'update:commentsOpen', open: boolean): void
  (e: 'comment-create', comment: MarkdownEditorComment): void
  (e: 'comment-reply', comment: MarkdownEditorComment, reply: MarkdownEditorCommentReply): void
  (e: 'comment-resolve', comment: MarkdownEditorComment): void
  (e: 'comment-delete', comment: MarkdownEditorComment): void
  (e: 'upload-error', error: unknown, file: File): void
  (e: 'ai-error', error: unknown): void
}

export const MARKDOWN_EDITOR_DEFAULT_LABELS: MarkdownEditorLabels = {
  wysiwyg: 'Rich text',
  source: 'Markdown',
  preview: 'Preview',
  modeGroup: 'Editor mode',
  toolbar: 'Formatting',
  heading: 'Heading',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  slashMenu: 'Insert',
  selectionToolbar: 'Format selection',
  ai: 'Ask AI',
  aiImprove: 'Improve writing',
  aiShorten: 'Make shorter',
  aiExpand: 'Make longer',
  aiFix: 'Fix spelling & grammar',
  aiTranslate: 'Translate',
  aiPlaceholder: 'Tell AI what to change…',
  aiSend: 'Send',
  aiWorking: 'Rewriting…',
  aiChanges: 'Show changes',
  aiReplace: 'Replace',
  aiInsertBelow: 'Insert below',
  aiRetry: 'Try again',
  aiStop: 'Stop',
  aiDiscard: 'Discard',
  aiFailed: 'The AI could not answer. Try again in a moment.',
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
  code: 'Inline code',
  highlight: 'Highlight',
  highlightColors: 'Highlight colors',
  highlightYellow: 'Yellow',
  highlightGreen: 'Green',
  highlightBlue: 'Blue',
  highlightPink: 'Pink',
  highlightPurple: 'Purple',
  removeHighlight: 'Remove highlight',
  quote: 'Quote',
  calloutNote: 'Note',
  calloutTip: 'Tip',
  calloutImportant: 'Important',
  calloutWarning: 'Warning',
  calloutCaution: 'Caution',
  bulletList: 'Bulleted list',
  orderedList: 'Numbered list',
  taskList: 'Task list',
  link: 'Link',
  image: 'Image',
  table: 'Table',
  codeBlock: 'Code block',
  math: 'Formula',
  divider: 'Divider',
  emoji: 'Emoji',
  undo: 'Undo',
  redo: 'Redo',
  comment: 'Comment',
  comments: 'Comments',
  close: 'Close',
  commentPlaceholder: 'Add a comment…',
  replyPlaceholder: 'Reply…',
  commentSubmit: 'Comment',
  replySubmit: 'Reply',
  cancel: 'Cancel',
  resolve: 'Resolve',
  reopen: 'Reopen',
  delete: 'Delete',
  resolved: 'Resolved',
  noComments: 'Select text and choose Comment to start a thread.',
  detached: 'The commented text was removed.',
  emojiSearch: 'Search emoji',
  emojiEmpty: 'No emoji found',
  emojiRecent: 'Recent',
  emojiPeople: 'Smileys & people',
  emojiNature: 'Animals & nature',
  emojiFood: 'Food & drink',
  emojiActivity: 'Activities',
  emojiTravel: 'Travel & places',
  emojiObjects: 'Objects',
  emojiSymbols: 'Symbols',
  emojiFlags: 'Flags',
  linkPlaceholder: 'Paste or type a link',
  apply: 'Apply',
  removeLink: 'Remove link',
  mathPlaceholder: 'TeX, e.g. E = mc^2',
  tableColumn: 'Column',
  uploading: 'Uploading',
  uploadFailed: 'Upload failed',
  words: '{count} words',
  characters: '{count} characters',
  peers: '{count} editing',
  you: 'You',
}
