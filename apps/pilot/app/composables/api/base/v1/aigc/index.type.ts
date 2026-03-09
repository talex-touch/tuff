import type { IBaseEntity } from '../../index.type'

export interface IPromptRole extends IBaseEntity {
  title: string
  description: string
  keywords: string
  avatar: string
  status: number
  usages: any[]
}
