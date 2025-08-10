import type { TuffItem } from '@talex-touch/utils/core-box/tuff/tuff-dsl'

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
