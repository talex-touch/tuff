export type TxIconType = 'emoji' | 'url' | 'file' | 'class'

export type TxIconStatus = 'normal' | 'loading' | 'error'

export interface TxIconSource {
  type: TxIconType
  value: string
  status?: TxIconStatus
}
