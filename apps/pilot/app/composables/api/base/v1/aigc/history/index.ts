import type { IChatConversation } from '~/composables/api/base/v1/aigc/completion-types'
import { $endApi } from '~/composables/api/base'
import { PersistStatus } from '~/composables/api/base/v1/aigc/completion-types'
import { decodeObject, encodeObject } from '~/composables/common'
import { $event } from '~/composables/events'

export interface IHistoryManager {
  syncHistory: (history: IChatConversation) => Promise<boolean>
  uploadHistory: (history: IChatConversation, uploadHandler: IUploadHistoryHandler) => Promise<boolean>
}

export interface IUploadHistoryHandler {
  onHistorySyncing: () => void
  onHistoryUploadFailed: (error: Error) => void
  onHistoryUploadSuccess: () => void
}

export enum IHistoryStatus {
  DONE,
  LOADING,
  COMPLETED,
  ERROR,
}

export interface IHistoryOption {
  list: Map<string, IChatConversation>
  status: IHistoryStatus
  page: number
}

export class HistoryManager implements IHistoryManager {
  // TODO: performance - shallowReactive
  options: IHistoryOption = reactive({
    list: new Map(),
    status: IHistoryStatus.DONE,
    page: 0,
  })

  constructor() {
    $event.on('USER_LOGOUT_SUCCESS', () => {
      this.resetState()
      void this.loadHistories()
    })
    $event.on('USER_LOGIN_SUCCESS', async () => {
      this.resetState()
      void this.loadHistories()
    })
  }

  private resetState() {
    this.options.list.clear()
    this.options.status = IHistoryStatus.DONE
    this.options.page = 0
  }

  private resolveConversationFromServer(item: any): IChatConversation | null {
    const row = item && typeof item === 'object' ? item : null
    if (!row)
      return null

    const chatId = String((row.chat_id || row.id || '') as string).trim()
    if (!chatId)
      return null

    const rawValue = String((row.value || '') as string).trim()
    if (!rawValue)
      return null

    let decoded: any
    try {
      decoded = decodeObject(rawValue)
    }
    catch {
      return null
    }

    const updatedAt = new Date(String((row.updatedAt || '') as string)).getTime()
    const lastUpdate = Number.isFinite(updatedAt)
      ? updatedAt
      : Number(decoded?.lastUpdate || Date.now())
    const rawMeta = String((row.meta || '') as string).trim()
    const meta = (() => {
      if (!rawMeta)
        return {} as Record<string, unknown>
      try {
        const parsed = JSON.parse(rawMeta)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          return parsed as Record<string, unknown>
      }
      catch {
        // ignore invalid legacy meta
      }
      return {} as Record<string, unknown>
    })()
    const syncStatus = String(meta.sync_status || decoded?.sync || '').trim().toLowerCase()
    let sync = PersistStatus.SUCCESS
    if (syncStatus === PersistStatus.PENDING || syncStatus === 'streaming')
      sync = PersistStatus.PENDING
    else if (syncStatus === PersistStatus.FAILED || syncStatus === 'failed')
      sync = PersistStatus.FAILED

    return {
      ...decoded,
      id: chatId,
      topic: String((row.topic || decoded?.topic || '新的聊天') as string).trim() || '新的聊天',
      messages: Array.isArray(decoded?.messages) ? decoded.messages : [],
      lastUpdate,
      sync,
    } as IChatConversation
  }

  async searchHistories(query: string) {
    return $endApi.v1.aigc.getConversations({
      pageSize: 25,
      page: 1,
      topic: query,
    })
  }

  async loadHistories() {
    this.options.status = IHistoryStatus.LOADING
    this.options.page += 1

    const res: any = await $endApi.v1.aigc.listConversation({
      pageSize: 25,
      page: this.options.page,
    })

    this.options.status = IHistoryStatus.DONE

    if (res.code !== 200) {
      return ElMessage({
        message: `获取历史记录失败!所有操作不会被保存!`,
        grouping: true,
        type: 'error',
        plain: true,
      })
    }

    const totalPages = res.data.meta.totalPages
    if (totalPages <= this.options.page) {
      this.options.status = IHistoryStatus.COMPLETED
      this.options.page -= 1
    }

    res.data.items.forEach((item: IChatConversation & { chat_id: string, updatedAt: string }) => {
      const mapped = this.resolveConversationFromServer(item)
      if (!mapped)
        return
      this.options.list.set(mapped.id, mapped)
    })
  }

  async syncHistory(history: IChatConversation) {
    if (this.options.status === IHistoryStatus.LOADING)
      console.warn('HistoryManager is loading, 2 throttle sync request may cause error')

    if (!history?.id?.length) {
      history.sync = PersistStatus.FAILED
      ElMessage.error('history id is empty')
      return false
    }

    history.sync = PersistStatus.PENDING

    try {
      const res: any = await $endApi.v1.aigc.getConversation(history.id)
      if (res.code !== 200 || !res.data)
        throw new Error(res.message || 'Sync failed')

      const mapped = this.resolveConversationFromServer(res.data)
      if (!mapped)
        throw new Error('Sync response is invalid')

      this.options.list.set(mapped.id, mapped)
      Object.assign(history, mapped)
      history.sync = PersistStatus.SUCCESS

      return true
    }
    catch (error: any) {
      history.sync = PersistStatus.FAILED
      ElMessage.error(error?.message || 'Sync failed')
      return false
    }
  }

  async uploadHistory(history: IChatConversation, uploadHandler: IUploadHistoryHandler) {
    uploadHandler.onHistorySyncing()

    async function _innerUpload() {
      if (!history.id?.length) {
        uploadHandler.onHistoryUploadFailed(new Error('history id is empty'))
        return false
      }

      const uploadTime = new Date()

      // const meta: Record<string, any> = {
      //   sync: true,
      //   lastUpdate: uploadTime.getTime(),
      //   templateId: history.templateId || -1, // 兜底策略，兼容以前版本
      // }
      history.lastUpdate = uploadTime.getTime()
      history.sync = PersistStatus.SUCCESS

      const uploadQuery = {
        chat_id: history.id,
        topic: history.topic,
        value: encodeObject(history),
        meta: '',
      }

      const res = await $endApi.v1.aigc.uploadHistory(uploadQuery)

      if (res.message !== 'success') {
        uploadHandler.onHistoryUploadFailed(new Error(res.message || 'Upload failed'))
        return false
      }

      uploadHandler.onHistoryUploadSuccess()

      return true
    }

    return _innerUpload()
  }

  isLoading() {
    return this.options.status === IHistoryStatus.LOADING
  }
}

export const $historyManager = new HistoryManager()
