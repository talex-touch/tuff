import type { IStandardResponse } from '../index.type'

export interface IUploadResponse extends IStandardResponse {
  data: {
    filename: string
  }
}

