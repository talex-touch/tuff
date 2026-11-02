export type MikoState =
  | 'idle'
  | 'working'
  | 'thinking'
  | 'success'
  | 'alert'
  | 'error'
  | 'sleeping'
  | 'juggling'
  | 'sweeping'
  | 'reading'
  | 'dizzy'
  | 'peeking'

export type MikoSize = 'xs' | 'sm' | 'md' | 'lg' | (string & {}) | number

export interface MikoLabels {
  idle: string
  working: string
  thinking: string
  success: string
  alert: string
  error: string
  sleeping: string
  juggling: string
  sweeping: string
  reading: string
  dizzy: string
  peeking: string
}

export const MIKO_DEFAULT_LABELS: MikoLabels = {
  idle: '待命',
  working: '执行中',
  thinking: '思考中',
  success: '完成',
  alert: '待确认',
  error: '异常',
  sleeping: '休眠',
  juggling: '多任务',
  sweeping: '整理中',
  reading: '研读中',
  dizzy: '眩晕',
  peeking: '观察中',
}

export interface MikoProps {
  /**
   * 当前状态
   * @default 'idle'
   */
  state?: MikoState
  /**
   * 尺寸大小，支持 'xs' (24px) | 'sm' (32px) | 'md' (48px) | 'lg' (64px) 或自定义宽高数值
   * @default 'md'
   */
  size?: MikoSize
  /**
   * 主体颜色
   * @default '#810DC6'
   */
  color?: string
  /**
   * 文案标签
   */
  labels?: Partial<MikoLabels>
  /**
   * 可访问名称
   */
  ariaLabel?: string
}

export interface MikoEmits {
  (e: 'click', event: MouseEvent): void
}
