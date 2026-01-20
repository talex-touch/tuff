import type { TxIconSource } from '../../icon'

export interface CommandPaletteItem {
  id: string
  title: string
  description?: string
  keywords?: string[]
  icon?: TxIconSource | string
  shortcut?: string
  disabled?: boolean
}

export interface CommandPaletteProps {
  modelValue: boolean
  commands: CommandPaletteItem[]
  placeholder?: string
  emptyText?: string
  maxHeight?: number
  autoFocus?: boolean
  closeOnSelect?: boolean
}

export interface CommandPaletteEmits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'select', item: CommandPaletteItem): void
  (e: 'open'): void
  (e: 'close'): void
  (e: 'update:query', value: string): void
}
