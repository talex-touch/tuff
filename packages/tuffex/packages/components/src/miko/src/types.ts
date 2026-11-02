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
  | 'running'
  | 'demon'
  | 'coffee'
  | 'guitar'
  | 'sleepy'
  | 'ninja'
  | 'fishing'
  | 'magic'
  | 'umbrella'
  | 'heart'
  | 'workout'
  | 'dj'
  | 'chef'
  | 'space'

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
  running: string
  demon: string
  coffee: string
  guitar: string
  sleepy: string
  ninja: string
  fishing: string
  magic: string
  umbrella: string
  heart: string
  workout: string
  dj: string
  chef: string
  space: string
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
  running: '奔跑中',
  demon: '闪光恶魔',
  coffee: '品尝咖啡',
  guitar: '弹奏吉他',
  sleepy: '困倦呵欠',
  ninja: '忍者潜行',
  fishing: '垂钓时光',
  magic: '施展魔法',
  umbrella: '雨中漫步',
  heart: '发射爱心',
  workout: '举重健身',
  dj: 'DJ打碟',
  chef: '料理大厨',
  space: '太空宇航',
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
   * 是否开启交互响应（悬停柔和发光、点击欢快互动动效、连续点击眩晕彩蛋）
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
  /**
   * 是否强制化身为「闪光恶魔」变异形态（小恶魔犄角、蝙蝠羽翼、小恶魔叉尾与闪烁星火）
   * @default false
   */
  demon?: boolean
  /**
   * 触发随机变异为「闪光恶魔」的概率 (0 ~ 1)，默认为 0.06 (6%)
   * @default 0.06
   */
  mutationChance?: number
}

export interface MikoEmits {
  click: [event: MouseEvent]
  stateChange: [state: MikoState]
  'update:state': [state: MikoState]
  mutate: [isDemon: boolean]
}
