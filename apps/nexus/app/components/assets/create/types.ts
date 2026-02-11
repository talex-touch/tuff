export type AssetCreateType = 'plugin' | 'extension' | 'css_resource' | 'layout_resource'

export interface AssetTypeOption {
  type: AssetCreateType
  title: string
  description: string
  icon: string
  beta?: boolean
  disabled?: boolean
}
