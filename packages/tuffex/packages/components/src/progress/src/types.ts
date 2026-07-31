export interface ProgressProps {
  percentage?: number
  status?: 'success' | 'error' | 'warning' | ''
  strokeWidth?: number
  showText?: boolean
  indeterminate?: boolean
  format?: (percentage: number) => string
}
