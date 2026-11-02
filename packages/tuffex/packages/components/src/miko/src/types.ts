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
  | 'stretching'
  | 'bathing'
  | 'curious'
  | 'scratching'
  | 'purring'
  | 'eating'
  | 'dancing'
  | 'cheering'
  | 'gaming'
  | 'hacking'
  | 'celebrating'
  | 'box'

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
  stretching: string
  bathing: string
  curious: string
  scratching: string
  purring: string
  eating: string
  dancing: string
  cheering: string
  gaming: string
  hacking: string
  celebrating: string
  box: string
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
  stretching: '伸懒腰',
  bathing: '舔爪洗脸',
  curious: '好奇',
  scratching: '磨爪',
  purring: '呼噜',
  eating: '吃鱼干',
  dancing: '跳舞',
  cheering: '打call',
  gaming: '打游戏',
  hacking: '极客超频',
  celebrating: '庆祝',
  box: '钻纸箱',
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
  /**
   * 是否开启交互响应（悬停轻微浮起、点击欢快互动动效、连续点击眩晕彩蛋）
   * @default false
   */
  interactive?: boolean
  /**
   * 是否在空闲时随机切换日常动作状态（如伸懒腰、好奇歪头、洗脸、呼噜、探头、纸箱等）
   * @default false
   */
  random?: boolean
  /**
   * 随机动作切换的时间间隔（毫秒），默认为 5000ms
   * @default 5000
   */
  randomInterval?: number
}

export interface MikoEmits {
  (e: 'click', event: MouseEvent): void
  (e: 'stateChange', state: MikoState): void
  (e: 'update:state', state: MikoState): void
}
