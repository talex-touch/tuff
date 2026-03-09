import type { IPageResponse, IStandardResponse } from '../../index.type'
import type { IHistoryUploadQuery } from './completion-types'
import type { HistoryQuery } from './history/index.type'
import { endHttp } from '~/composables/api/axios'

export default {
  uploadHistory(history: IHistoryUploadQuery) {
    return endHttp.post('aigc/conversations', history)
  },
  getConversations(query: Partial<HistoryQuery>): Promise<IPageResponse<any>> {
    return endHttp.get('aigc/conversations', query)
  },
  listConversation(query: Partial<HistoryQuery>): Promise<IPageResponse<any>> {
    return endHttp.get('aigc/history', query)
  },
  getConversation(id: string): Promise<IStandardResponse> {
    return endHttp.get(`aigc/conversation/${id}`)
  },
  deleteConversation(id: string) {
    return endHttp.del(`aigc/conversations/${id}`)
  },
  getPromptDetail(id: number) {
    return endHttp.get(`aigc/prompts/detail/${id}`)
  },
  createShareMessage(chat_id: string) {
    return endHttp.post(`aigc/conversation/share/${chat_id}`)
  },
  getShareMessage(uuid: string) {
    return endHttp.get(`aigc/conversation/share/${uuid}`)
  },
  getChatShareMessage(chat_id: string) {
    return endHttp.get(`aigc/conversation/share_chat/${chat_id}`)
  },
  getUserShareList(page: number, pageSize: number) {
    return endHttp.get('aigc/conversation/share_list', {
      page,
      pageSize,
    })
  },
  searchPromptTemplate(keyword: string) {
    return endHttp.get('aigc/prompts/search', { keyword, pageSize: 50 })
  },
  getHostList() {
    return endHttp.get('aigc/prompts/hot')
  },
  recommendTags() {
    return endHttp.get('aigc/prompts/tags/recommend')
  },
  getShareList() {
    return endHttp.get('aigc/conversation/share_list') as Promise<IPageResponse<any>>
  },
}
