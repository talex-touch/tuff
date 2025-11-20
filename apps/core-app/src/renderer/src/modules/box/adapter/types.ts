import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import type { ComputedRef, Ref } from 'vue'

export enum BoxMode {
  INPUT = 'input',
  COMMAND = 'command',
  IMAGE = 'image',
  FILE = 'file',
  FEATURE = 'feature',
}

export type SearchItem = TuffItem

export interface IBoxOptions {
  lastHidden: number
  mode: BoxMode
  focus: number
  file: {
    buffer?: Uint8Array | null // deprecated, use iconPath
    iconPath?: string
    paths: string[]
  }
  data: any
}

export interface IUseSearch {
  searchVal: Ref<string>
  select: Ref<number>
  res: Ref<TuffItem[]> | ComputedRef<TuffItem[]>
  loading: Ref<boolean>
  activeItem: ComputedRef<TuffItem>
  activeActivations: Ref<IProviderActivate[] | null>
  handleExecute: (item?: TuffItem) => Promise<void>
  handleExit: () => void
  handleSearchImmediate: () => Promise<void>
  deactivateProvider: (providerId?: string) => Promise<boolean>
  // 已移除: handleSearch, deactivateAllProviders, cancelSearch
}
