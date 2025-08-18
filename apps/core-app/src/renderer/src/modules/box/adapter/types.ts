import { Ref } from 'vue'
import { TuffItem } from '@talex-touch/utils'

export enum BoxMode {
  INPUT = 'input',
  COMMAND = 'command',
  IMAGE = 'image',
  FILE = 'file',
  FEATURE = 'feature'
}

export type SearchItem = TuffItem

export interface IBoxOptions {
  lastHidden: number
  mode: BoxMode
  focus: number
  file: {
    buffer: Uint8Array | null
    paths: string[]
  }
  data: any
}

export interface IActivatedProvider {
  uniqueId: string
  name: string
  icon?: any
}

export interface IUseSearch {
  searchVal: Ref<string>
  select: Ref<number>
  res: Ref<TuffItem[]>
  loading: Ref<boolean>
  activeItem: Ref<TuffItem>
  activatedProviders: Ref<IActivatedProvider[]>
  handleSearch: () => Promise<void>
  handleExecute: (item?: TuffItem) => Promise<void>
  handleExit: () => void
  deactivateProvider: (providerId?: string) => Promise<void>
}
