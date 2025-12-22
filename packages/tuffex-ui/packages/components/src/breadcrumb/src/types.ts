export interface BreadcrumbItem {
  label: string
  href?: string
  icon?: string
  disabled?: boolean
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[]
  separatorIcon?: string
}

export interface BreadcrumbEmits {
  click: [item: BreadcrumbItem, index: number]
}
