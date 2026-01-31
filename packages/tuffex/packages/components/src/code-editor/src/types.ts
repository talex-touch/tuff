import type { Extension } from '@codemirror/state'
import type { TxIconSource } from '../../icon'

export type CodeEditorLanguage = 'json' | 'yaml' | 'toml' | 'ini' | 'javascript' | 'js'
export type CodeEditorTheme = 'auto' | 'light' | 'dark' | 'github' | 'dracula' | 'monokai'

export interface CodeEditorProps {
  modelValue?: string
  language?: CodeEditorLanguage
  theme?: CodeEditorTheme
  readOnly?: boolean
  lineNumbers?: boolean
  lineWrapping?: boolean
  placeholder?: string
  tabSize?: number
  formatOnBlur?: boolean
  formatOnInit?: boolean
  lint?: boolean
  search?: boolean
  completion?: boolean
  extensions?: Extension[]
}

export interface CodeEditorEmits {
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
  (e: 'focus'): void
  (e: 'blur'): void
  (e: 'format', payload: { value: string; language: CodeEditorLanguage }): void
}

export type CodeEditorToolbarActionKey = 'format' | 'search' | 'foldAll' | 'unfoldAll' | 'copy'

export interface CodeEditorToolbarAction {
  key: CodeEditorToolbarActionKey
  label?: string
  icon?: TxIconSource | string
  active?: boolean
  disabled?: boolean
  shortcut?: string
}

export interface CodeEditorToolbarProps {
  actions?: CodeEditorToolbarAction[]
  compact?: boolean
}

export interface CodeEditorToolbarEmits {
  (e: 'action', key: CodeEditorToolbarActionKey): void
}
