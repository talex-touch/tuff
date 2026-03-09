import { endHttp } from './api/axios'

import type { QuotaModel } from './api/base/v1/aigc/completion-types'
import type { ThHistory } from '~/components/history/history-types'

export interface ChatCompletionDto {
  model: QuotaModel

  temperature: number

  tools: boolean

  generateTitle: boolean

  generateSummary: number

  templateId: number
}
export interface ChatLogQueryDto extends Record<string, any> {
  message_type: number

  model: string

  status: string

  page: number

  pageSize: number
}

export enum ChatMsgType {
  GENERATE_TITLE,
  COMPLETION,
  GENERATE_IMAGE,
  GENERATE_VIDEO,
  GENERATE_AUDIO,
  GENERATE_DOCUMENT,
  COMPLETION_PROMPT_POLISH,
  COMPLETION_PROMPT_TRANSLATION,
}

export function deserializeMsgType(type: number) {
  switch (+type) {
    case ChatMsgType.GENERATE_TITLE:
      return '生成标题'
    case ChatMsgType.COMPLETION:
      return '生成文本'
    case ChatMsgType.GENERATE_IMAGE:
      return '生成图片'
    case ChatMsgType.GENERATE_VIDEO:
      return '生成视频'
    case ChatMsgType.GENERATE_AUDIO:
      return '生成音频'
    case ChatMsgType.GENERATE_DOCUMENT:
      return '生成文档'
    case ChatMsgType.COMPLETION_PROMPT_POLISH:
      return '润色提示词'
    case ChatMsgType.COMPLETION_PROMPT_TRANSLATION:
      return '翻译提示词'
    default:
      return '未知'
  }
}

export interface PromptQueryDto extends Record<string, any> {
  page?: number
  pageSize?: number
  /**
   * 标题
   */
  title?: string
}

export interface PromptEntityDto {
  /**
   * 提示词头像
   */
  avatar?: string
  /**
   * 提示文本
   */
  content?: string
  createdAt?: Date
  /**
   * 创建者
   */
  creator?: any
  id?: number
  /**
   * 提示词标题
   */
  title?: string
  description?: string
  keywords?: string | string[]
  updatedAt?: Date
  /**
   * 更新者
   */
  updater?: any
  /**
   * 使用记录
   */
  usages?: any[]
  audits?: any[]

  status?: number
  tags?: any[]
}

export class ChatAdminManager {
  list(query: ChatLogQueryDto) {
    return endHttp.get('aigc/chat_log', query)
  }

  consumption_statistics(startDate?: string, endDate?: string) {
    return endHttp.get('aigc/consumption_statistics', {
      startDate,
      endDate,
    })
  }

  statistics(startDate?: string, endDate?: string, userId?: number) {
    return endHttp.get('aigc/chat_log/statistics', {
      startDate,
      endDate,
      userId,
    })
  }

  async promptList(dto: PromptQueryDto) {
    return endHttp.post('aigc/prompts/list', dto)
  }

  async createTemplate(dto: PromptEntityDto) {
    return endHttp.post('aigc/prompts', dto)
  }

  async updateTemplate(id: string, dto: PromptEntityDto) {
    return endHttp.put(`aigc/prompts/${id}`, dto)
  }

  async auditTemplate(id: number, dto: { status: number, reason?: string }) {
    return endHttp.post(`aigc/prompts/audit/${id}`, {
      status: dto.status,
      reason: dto.reason,
    })
  }

  async publishTemplate(id: number, doPublish: boolean) {
    return endHttp.put(`aigc/prompts/status/${id}`, {
      online: doPublish,
    })
  }
}

export const chatAdminManager = new ChatAdminManager()
