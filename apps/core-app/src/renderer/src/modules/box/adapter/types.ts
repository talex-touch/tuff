import type { IProviderActivate, TuffContainerLayout, TuffItem } from '@talex-touch/utils'
import type { ComputedRef, Ref } from 'vue'

export enum BoxMode {
  INPUT = 'input',
  COMMAND = 'command',
  IMAGE = 'image',
  FILE = 'file',
  FEATURE = 'feature'
}

export type SearchItem = TuffItem

/** 布局模式 */
export type LayoutMode = 'list' | 'grid'

export interface IBoxOptions {
  lastHidden: number
  mode: BoxMode
  focus: number
  file: {
    buffer?: Uint8Array | null
    iconPath?: string
    paths: string[]
  }
  data: unknown
  /** 当前布局配置 */
  layout?: TuffContainerLayout
  /**
   * Grid columns BoxGrid is actually rendering, as it last measured them (undefined until it has).
   * The keyboard steps rows by this rather than by the declared count, which a narrow row cannot
   * honour without squeezing the tiles.
   */
  visibleGridColumns?: number
}

export interface IUseSearch {
  searchVal: Ref<string>
  select: Ref<number>
  res: Ref<TuffItem[]> | ComputedRef<TuffItem[]>
  loading: Ref<boolean>
  searchError: Ref<boolean>
  recommendationPending: Ref<boolean>
  activeItem: ComputedRef<TuffItem>
  activeActivations: Ref<IProviderActivate[] | null>
  replaceSearchResults: (items: TuffItem[]) => void
  handleExecute: (item?: TuffItem) => Promise<void>
  handleExit: () => Promise<void>
  handleSearchImmediate: (options?: { force?: boolean }) => Promise<void>
  deactivateProvider: (id?: string) => Promise<boolean>
  deactivateAllProviders: () => Promise<void>
  // 已移除: handleSearch, cancelSearch
}
