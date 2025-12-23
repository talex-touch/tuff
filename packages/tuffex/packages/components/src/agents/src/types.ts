export interface AgentItemProps {
  id: string
  name: string
  description?: string
  iconClass?: string
  selected?: boolean
  disabled?: boolean
  badgeText?: string | number
}

export interface AgentsListGroup<T> {
  id: string
  title: string
  iconClass?: string
  items: T[]
  badgeText?: string | number
}

export interface AgentsListProps {
  loading?: boolean
}
