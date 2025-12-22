export interface PaginationProps {
  currentPage?: number
  pageSize?: number
  total?: number
  totalPages?: number
  prevIcon?: string
  nextIcon?: string
  showInfo?: boolean
  showFirstLast?: boolean
}

export interface PaginationEmits {
  'update:currentPage': [page: number]
  pageChange: [page: number]
}
