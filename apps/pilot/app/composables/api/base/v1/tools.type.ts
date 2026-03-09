import type { extend } from 'dayjs'

export interface IStorageModel extends IStorage {}

interface IStorage {
  /**
   * 上传时间
   */
  createdAt: string
  /**
   * 文件扩展名
   */
  extName: string
  /**
   * 文件ID
   */
  id: number
  /**
   * 文件名
   */
  name: string
  /**
   * 文件路径
   */
  path: string
  /**
   * 大小
   */
  size: string
  /**
   * 文件类型
   */
  type: string
  /**
   * 上传者
   */
  username: string
}

export interface IStorageModelQuery extends IStorageModel {
  /**
   * 上传时间
   */
  time: string[]
  field?: string
  page: number
  pageSize: number
}
