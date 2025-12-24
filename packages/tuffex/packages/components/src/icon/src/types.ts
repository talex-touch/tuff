export type TxIconType = 'emoji' | 'url' | 'file' | 'class' | 'builtin'

export type TxIconStatus = 'normal' | 'loading' | 'error'

export interface TxIconSource {
  type: TxIconType
  value: string
  status?: TxIconStatus
}
