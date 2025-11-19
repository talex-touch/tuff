import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import type { Ref } from 'vue'

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
  res: Ref<TuffItem[]>
  loading: Ref<boolean>
  activeItem: Ref<TuffItem>
  activeActivations: Ref<IProviderActivate[] | null>
  handleSearch: () => Promise<void>
  handleSearchImmediate: () => Promise<void>
  handleExecute: (item?: TuffItem) => Promise<void>
  handleExit: () => void
  deactivateProvider: (providerId?: string) => Promise<void>
  deactivateAllProviders: () => Promise<void>
  cancelSearch: () => Promise<void>
}
