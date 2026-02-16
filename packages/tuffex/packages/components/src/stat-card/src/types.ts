export type StatCardInsightType = 'percent' | 'delta'
export type StatCardVariant = 'default' | 'progress'

export interface StatCardInsight {
  from: number
  to: number
  type?: StatCardInsightType
  color?: 'success' | 'danger' | 'warning' | 'info' | string
  iconClass?: string
  suffix?: string
  precision?: number
}

export interface StatCardProps {
  value: number | string
  label: string
  iconClass?: string
  clickable?: boolean
  insight?: StatCardInsight
  variant?: StatCardVariant
  progress?: number
  meta?: string
}
