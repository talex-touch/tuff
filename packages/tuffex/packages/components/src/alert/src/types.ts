export type AlertType = 'info' | 'success' | 'warning' | 'error'

export interface AlertProps {
  type?: AlertType
  title?: string
  message?: string
  closable?: boolean
  showIcon?: boolean
}

export interface AlertEmits {
  close: []
}
