import type { IChatInnerItem, IChatInnerItemMeta, IChatItem, IInnerItemMeta, IInnerItemType } from '../completion-types'
import { IChatItemStatus, IChatRole, QuotaModel } from '../completion-types'

export function randomUUID(type: 'Chat' | 'Item') {
  // 获取最后的时间戳6位
  const last6 = Date.now().toString().slice(-6)

  return `${type}-${randomStr(6)}-${last6}-${randomStr(6)}`
}

export function mapStrStatus(str: string) {
  if (str === 'progress')
    return IChatItemStatus.GENERATING
  else if (str === 'start')
    return IChatItemStatus.WAITING
  else if (str === 'end')
    return IChatItemStatus.AVAILABLE
  else if (str === 'calling')
    return IChatItemStatus.TOOL_CALLING
  else if (str === 'result')
    return IChatItemStatus.TOOL_RESULT
  else if (str === 'cancelled')
    return IChatItemStatus.CANCELLED
  else if (str === 'failed')
    return IChatItemStatus.ERROR
  else if (str === 'verbose')
    return IChatItemStatus.WAITING

  console.error('unknown status', str)

  return IChatItemStatus.AVAILABLE
}

export function calculateConversation(msgList: Ref<IChatItem[]>) {
  if (!msgList.value.length)
    return []

  const messageList: (IChatItem & { $index: number })[] = [
    { ...msgList.value[0], $index: 0 },
  ]

  if (msgList.value.length > 1)
    messageList.push({ ...msgList.value[1], $index: 1 })

  for (let i = 2; i < msgList.value.length; i += 1) {
    const msg = msgList.value[i]
    const listIndex = messageList.length - (i % 2 === 0 ? 1 : 2)
    const prev = messageList[listIndex]
    // const prev = msgList.value[i - (i % 2 === 0 ? 1 : 2)]

    const targetMsgItem = msg.content.find(item => item?.page === msg.page)
    if (!targetMsgItem && msg.content.length)
      msg.page = msg.content[0]?.page || 0

    const startPage = msg.content?.map(item => item?.page || 0).sort((a, b) => a - b)[0] || 0

    const prevPage = prev.page

    // console.log({ msg, prev, prevPage, page: msg.page })

    if (startPage === prevPage) {
      messageList.push({
        ...msg,
        $index: i,
      })
    }
  }

  // console.log('processed', messageList)

  return messageList
}

export class ChatItem implements IChatItem {
  id: string
  page: number
  role: IChatRole
  content: (IChatInnerItem | null)[]

  constructor(role: IChatRole = IChatRole.USER) {
    this.id = randomUUID('Item')
    this.page = 0
    this.role = role
    this.content = []
  }
}

export class ChatInnerItem implements IChatInnerItem {
  page: number
  model: QuotaModel | string
  status: IChatItemStatus
  timestamp: number
  value: IInnerItemMeta[]
  meta: IChatInnerItemMeta

  constructor({
    model = QuotaModel.QUOTA_THIS_NORMAL,
    page = 0,
    status = IChatItemStatus.AVAILABLE,
    timestamp = Date.now(),
    value = [],
    meta = {},
  }: IChatInnerItem = { model: QuotaModel.QUOTA_THIS_NORMAL, page: 0, value: [], meta: {}, timestamp: Date.now(), status: IChatItemStatus.AVAILABLE }) {
    this.page = page
    this.status = status
    this.timestamp = timestamp
    this.value = value
    this.model = model
    this.meta = meta
  }
}

export class InnerItemMeta implements IInnerItemMeta {
  type: IInnerItemType
  name: string | undefined
  data: string | undefined
  value: string
  extra: any

  constructor(type: IInnerItemType, value: string, name?: string, data?: string, extra?: any) {
    this.type = type
    this.name = name
    this.data = data
    this.value = value
    this.extra = extra
  }
}
export type { IInnerItemType }
