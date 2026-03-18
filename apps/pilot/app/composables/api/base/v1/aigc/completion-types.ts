export enum QuotaModel {
  QUOTA_THIS_TITLE = 'this-title',
  // 普通版本，纯问答（类豆包，普通联网）
  QUOTA_THIS_NORMAL = 'this-normal',
  // 中级模型，中级会员可用 （上下文更强，普通联网）
  QUOTA_THIS_NORMAL_TURBO = 'this-normal-turbo',
  // 高级模型，高级会员可用 （全功能，上下文更强，类GPT，高级联网+工具）
  QUOTA_THIS_NORMAL_ULTRA = 'this-normal-ultra',
}

export enum IChatItemStatus {
  /**
   * 正常状态，补全完成后即这个状态
   */
  AVAILABLE,

  /**
   * 已提交至后端，后端还未有任何响应
   */
  WAITING,

  /**
   * 正在补全中，会持续更新，直到补全完成
   */
  GENERATING,

  /**
   * 被用户手动取消
   */
  CANCELLED,

  /**
   * 被服务器拒绝，由于服务器问题被拒绝，比如服务器资源不足
   */
  REJECTED,

  /**
   * 对话超过3分钟，超时
   */
  TIMEOUT,

  /**
   * 对话由于触发服务器风控，被禁止
   */
  BANNED,

  /**
   * 对话进入工具调用状态
   */
  TOOL_CALLING,

  /**
   * 工具调用报错
   */
  TOOL_ERROR,

  /**
   * 工具调用结束，获得结果
   */
  TOOL_RESULT,

  /**
   * 未知错误
   */
  ERROR,
}

export enum IChatRole {
  /**
   * 系统内置（即系统提示）
   */
  SYSTEM = 'system',
  ASSISTANT = 'assistant',
  USER = 'user',
}

export interface IChatInnerItemMeta {
  internet?: boolean
  thinking?: boolean
  temperature?: number
  memoryEnabled?: boolean
  pilotMode?: boolean
}

export type IInnerItemType = 'markdown' | 'text' | 'tool' | 'card' | 'error' | 'file' | 'image'

export interface IInnerItemMeta {
  type: IInnerItemType
  name?: string
  data?: string
  value: string
  extra?: any
}

export interface IChatInnerItem {
  page: number
  model: QuotaModel | string
  status: IChatItemStatus
  timestamp: number

  value: IInnerItemMeta[]
  meta: IChatInnerItemMeta
}

export interface IChatItem {
  id: string
  page: number
  role: IChatRole
  content: (IChatInnerItem | null)[]
}

export enum IConversationSynchronizeStatus {
  SYNCING = 'syncing',
}

export enum PersistStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  MODIFIED = 'modified',
}

export type ISendState = 'idle' | 'sending_until_accepted'

export interface IChatPersist {
  sync: PersistStatus
}

export interface IChatConversation extends IChatPersist {
  /**
   * 对话ID，唯一标识，用于各处确定对话
   */
  id: string
  /**
   * 对话标题（也算是聊天主题）
   */
  topic: string

  messages: IChatItem[]

  lastUpdate: number
  // lastSummarizeIndex: number

  template?: {
    id: number
    avatar: string
    title: string
    description: string
  }

  pilotMode?: boolean
}

export interface IChatBody {
  chat_id: string
  index: number
  model: QuotaModel | string
  modelId?: string
  routeComboId?: string
  internet?: boolean
  thinking?: boolean
  memoryEnabled?: boolean
  pilotMode?: boolean
  messages: IChatItem[]
  temperature: number
  templateId: number

  generateTitle?: boolean
  signal?: AbortSignal
}

export interface IHistoryUploadQuery {
  /**
   * 如果上传的对话不存在会自动创建，若已存在，会自动更新
   */
  chat_id: string

  /**
   * 对话的主题（标题）
   */
  topic: string

  /**
   * 对话详细内容（JSON 字符串）
   */
  value: string

  /**
   * 对话的附属信息（JSON 字符串）
   */
  meta: string
}

export interface ICompletionHandler {
  onTriggerStatus?: (status: IChatItemStatus) => void
  onReqCompleted?: () => void
  onFrequentLimit?: () => void
  onAccepted?: (payload?: Record<string, unknown>) => void
  // return true to deny auto add
  onCompletion?: (name: string, text: string) => boolean
  onCompletionStart?: (name: string) => void
  onChainEnd?: (name: string) => void
  onToolStart?: (name: string, input?: string) => void
  onToolEnd?: (name: string, output?: string) => void
  onVerbose?: (name: string, data: string) => void
  onError?: () => void
}

export interface IToolHandler {
  onToolStart: (name: string, input?: string) => void
  onToolEnd: (name: string, output?: string) => void
}
