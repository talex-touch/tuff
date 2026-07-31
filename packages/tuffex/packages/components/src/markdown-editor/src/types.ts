export type MarkdownEditorMode = 'wysiwyg' | 'source' | 'preview'
export type MarkdownEditorTheme = 'auto' | 'light' | 'dark'

export type MarkdownEditorToolbarActionKey =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'quote'
  | 'code'
  | 'bulletList'
  | 'orderedList'
  | 'link'
  | 'undo'
  | 'redo'

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
  /**
   * Accessible label announced for both editing surfaces (the WYSIWYG
   * `role="textbox"` and the source `<textarea>`), which are otherwise unnamed.
   * @default 'Markdown editor'
   */
  ariaLabel?: string
  linkPrompt?: (selectedText: string) => string | Promise<string>
}

export interface MarkdownEditorEmits {
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
  (e: 'update:mode', mode: MarkdownEditorMode): void
  (e: 'mode-change', mode: MarkdownEditorMode): void
  (e: 'focus'): void
  (e: 'blur'): void
}
