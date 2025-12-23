export type TimelineLayout = 'vertical' | 'horizontal'

export type TimelineItemColor = 'default' | 'primary' | 'success' | 'warning' | 'error'

export interface TimelineContext {
  layout: TimelineLayout
}

export interface TimelineProps {
  layout?: TimelineLayout
}

export interface TimelineItemProps {
  title?: string
  time?: string
  icon?: string
  color?: TimelineItemColor
  active?: boolean
}
