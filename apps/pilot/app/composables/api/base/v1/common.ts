import { endHttp } from '../../axios'
import type { IDataResponse } from '../index.type'
import type { FeedbackQuery, IUploadResponse } from './common.type'

export default {
  status(): Promise<IDataResponse<any>> {
    return endHttp.get('auth/status')
  },
  upload(file: File): Promise<IUploadResponse> {
    const formData = new FormData()
    formData.append('file', file)

    return this.uploadCustom(formData)
  },
  uploadCustom(formData: FormData): Promise<IUploadResponse> {
    return endHttp.post('tools/upload', formData)
  },


}
