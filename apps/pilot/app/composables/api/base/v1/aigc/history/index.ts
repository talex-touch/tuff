import type { IChatConversation } from '~/composables/api/base/v1/aigc/completion-types'
import { $endApi } from '~/composables/api/base'
import { PersistStatus } from '~/composables/api/base/v1/aigc/completion-types'
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

function filterRenderableConversationMessages(messages: unknown): any[] {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages.filter((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false
    }
    const role = String((item as Record<string, unknown>).role || '').trim().toLowerCase()
    return role !== 'system'
  })
}

export class HistoryManager implements IHistoryManager {
  // TODO: performance - shallowReactive
  options: IHistoryOption = reactive({
    list: new Map(),
    status: IHistoryStatus.DONE,
    page: 0,
  })

  private loadHistoriesPromise: Promise<void> | null = null

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
    this.loadHistoriesPromise = null
  }

  private resolveConversationFromServer(item: any): IChatConversation | null {
    const row = item && typeof item === 'object' ? item : null
    if (!row)
      return null

    const chatId = String((row.chat_id || row.id || '') as string).trim()
    if (!chatId)
      return null

    const summaryOnly = row.summary_only === true || row.summaryOnly === true
    const decoded = (() => {
      const value = row.value
      if (value && typeof value === 'object' && !Array.isArray(value))
        return value as Record<string, unknown>

      const rawValue = typeof value === 'string' ? value.trim() : ''
      if (rawValue) {
        try {
          const parsed = JSON.parse(rawValue)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            return parsed as Record<string, unknown>
        }
        catch {
          // ignore invalid payload
        }
      }

      if (Array.isArray(row.messages)) {
        return {
          id: chatId,
          topic: row.topic,
          messages: row.messages,
        } as Record<string, unknown>
      }

      if (summaryOnly) {
        return {
          id: chatId,
          topic: row.topic,
          messages: [],
        } as Record<string, unknown>
      }

      return null
    })()
    if (!decoded)
      return null

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
    const runtimeState = String((row.run_state || meta.run_state || '') as string).trim().toLowerCase()
    const pendingCount = Number(row.pending_count ?? meta.pending_count ?? 0)
    const activeTurnId = String((row.active_turn_id || meta.active_turn_id || '') as string).trim()
    let sync = PersistStatus.SUCCESS
    if (syncStatus === PersistStatus.PENDING || syncStatus === 'streaming')
      sync = PersistStatus.PENDING
    else if (syncStatus === PersistStatus.FAILED || syncStatus === 'failed')
      sync = PersistStatus.FAILED

    return {
      ...decoded,
      id: chatId,
      topic: String((row.topic || decoded?.topic || '新的聊天') as string).trim() || '新的聊天',
      messages: filterRenderableConversationMessages(decoded?.messages),
      lastUpdate,
      sync,
      runtimeState,
      pendingCount: Number.isFinite(pendingCount) ? pendingCount : 0,
      activeTurnId: activeTurnId || null,
      __summaryOnly: summaryOnly,
      __hydrated: !summaryOnly,
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
    if (this.options.status === IHistoryStatus.COMPLETED) {
      return
    }
    if (this.options.status === IHistoryStatus.LOADING && this.loadHistoriesPromise) {
      return this.loadHistoriesPromise
    }

    const nextPage = this.options.page + 1
    this.options.status = IHistoryStatus.LOADING

    this.loadHistoriesPromise = (async () => {
      try {
        const res: any = await $endApi.v1.aigc.listConversation({
          pageSize: 25,
          page: nextPage,
          summary: 1,
        })

        if (res.code !== 200) {
          this.options.status = IHistoryStatus.ERROR
          ElMessage({
            message: `获取历史记录失败!所有操作不会被保存!`,
            grouping: true,
            type: 'error',
            plain: true,
          })
          return
        }

        const totalPages = Number(res.data?.meta?.totalPages || 0)
        this.options.page = totalPages > 0 ? nextPage : 0
        this.options.status = (totalPages <= 0 || totalPages <= nextPage)
          ? IHistoryStatus.COMPLETED
          : IHistoryStatus.DONE

        res.data.items.forEach((item: IChatConversation & { chat_id: string, updatedAt: string }) => {
          const mapped = this.resolveConversationFromServer(item)
          if (!mapped)
            return
          this.options.list.set(mapped.id, mapped)
        })
      }
      finally {
        if (this.options.status === IHistoryStatus.ERROR) {
          this.options.status = IHistoryStatus.DONE
        }
        this.loadHistoriesPromise = null
      }
    })()

    return this.loadHistoriesPromise
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
        value: JSON.stringify(history),
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
